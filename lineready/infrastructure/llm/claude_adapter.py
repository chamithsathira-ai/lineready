"""Claude adapter (LLM port implementation).

* Structured outputs: every call returns JSON matching a schema.
* Prompt caching: system prompts are frozen strings; automatic cache_control.
* Server-side refusal fallback where available; on any failure we return None
  and the caller falls back to deterministic templates. The brief never depends
  on the LLM being up.
"""
from __future__ import annotations

import hashlib
import json
import logging

import anthropic

from lineready.config import settings

log = logging.getLogger("lineready.llm")
_client: anthropic.Anthropic | None = None
_fallback_supported = True
USAGE = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}


def client() -> anthropic.Anthropic | None:
    global _client
    if not settings.llm_enabled:
        return None
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2)
    return _client


def _track(resp) -> None:
    u = resp.usage
    USAGE["calls"] += 1
    USAGE["input_tokens"] += (u.input_tokens or 0) + (getattr(u, "cache_creation_input_tokens", 0) or 0) \
        + (getattr(u, "cache_read_input_tokens", 0) or 0)   # total prompt tokens, however billed
    USAGE["output_tokens"] += u.output_tokens or 0
    USAGE["cache_read_input_tokens"] += getattr(u, "cache_read_input_tokens", 0) or 0


def _cache_get(key: str) -> dict | None:
    from lineready.infrastructure.persistence.db import query_one
    row = query_one("SELECT response FROM llm_cache WHERE key = %s", (key,))
    return row["response"] if row else None


def _cache_put(key: str, kind: str, value: dict) -> None:
    from psycopg.types.json import Jsonb
    from lineready.infrastructure.persistence.db import connect
    with connect() as conn:
        conn.execute("INSERT INTO llm_cache (key, kind, response) VALUES (%s,%s,%s) ON CONFLICT (key) DO NOTHING",
                     (key, kind, Jsonb(value)))


def json_call(system: str, user: str, schema: dict, effort: str = "medium", max_tokens: int = 4000,
              kind: str = "json") -> dict | None:
    """Structured call with a persistent response cache: identical inputs never cost tokens twice."""
    global _fallback_supported
    c = client()
    if c is None:
        return None
    key = hashlib.sha256(json.dumps([settings.llm_model, system, user, schema, effort], sort_keys=True)
                         .encode()).hexdigest()
    cached = _cache_get(key)
    if cached is not None:
        USAGE["cache_hits"] = USAGE.get("cache_hits", 0) + 1
        return cached
    params = dict(
        model=settings.llm_model,
        max_tokens=max_tokens,
        system=system,
        cache_control={"type": "ephemeral"},
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": user}],
    )
    try:
        if _fallback_supported:
            try:
                resp = c.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **params)
            except anthropic.BadRequestError as e:
                log.warning("fallbacks not accepted, continuing without: %s", e.message)
                _fallback_supported = False
                resp = c.messages.create(**params)
        else:
            resp = c.messages.create(**params)
    except anthropic.APIStatusError as e:
        log.error("Claude API error %s: %s", e.status_code, e.message)
        return None
    except anthropic.APIConnectionError as e:
        log.error("Claude API connection error: %s", e)
        return None
    _track(resp)
    if resp.stop_reason in ("refusal", "max_tokens"):
        log.warning("LLM stop_reason=%s", resp.stop_reason)
        return None
    text = "".join(b.text for b in resp.content if b.type == "text")
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        log.error("LLM returned non-JSON output")
        return None
    _cache_put(key, kind, out)
    return out
