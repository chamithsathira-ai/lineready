"""Append-only, hash-chained audit log. Editing any past row breaks the chain."""
from __future__ import annotations

import hashlib
import json

from psycopg.types.json import Jsonb

from lineready.infrastructure.persistence.db import connect


def record(actor: str, kind: str, ref: str, payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, default=str)
    with connect() as conn:
        conn.execute("LOCK TABLE audit_event IN EXCLUSIVE MODE")
        prev = conn.execute("SELECT hash FROM audit_event ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = prev["hash"] if prev else "GENESIS"
        h = hashlib.sha256(f"{prev_hash}|{actor}|{kind}|{ref}|{body}".encode()).hexdigest()
        conn.execute("INSERT INTO audit_event (actor, kind, ref, payload, prev_hash, hash) VALUES (%s,%s,%s,%s,%s,%s)",
                     (actor, kind, ref, Jsonb(json.loads(body)), prev_hash, h))
    return h


def verify_chain() -> tuple[bool, int]:
    with connect() as conn:
        rows = conn.execute("SELECT actor, kind, ref, payload, prev_hash, hash FROM audit_event ORDER BY id").fetchall()
    prev = "GENESIS"
    for r in rows:
        body = json.dumps(r["payload"], sort_keys=True, default=str)
        if r["prev_hash"] != prev or hashlib.sha256(
                f"{prev}|{r['actor']}|{r['kind']}|{r['ref']}|{body}".encode()).hexdigest() != r["hash"]:
            return False, len(rows)
        prev = r["hash"]
    return True, len(rows)
