"""Ask agent: answers engineer questions with tool use over the read-only retrieval layer.

Token discipline:
  * tool results are compact JSON (ids + short excerpts), never raw documents
  * at most MAX_ROUNDS tool rounds; short-term memory keeps only the last 3 Q/A pairs as text
  * the system prompt and tool list are frozen so prompt caching applies
Guardrails:
  * citations must be evidence ids returned by tools in this conversation (R2), others are stripped
  * policy linter on the answer (R3a); a failing answer is replaced, never shown
"""
from __future__ import annotations

import json
import logging
import uuid

import anthropic
from psycopg.types.json import Jsonb

from lineready.config import settings
from lineready.domain.rules.policy import lint
from lineready.infrastructure.llm.claude_adapter import USAGE, _track, client
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one
from lineready.retrieval import search

log = logging.getLogger("lineready.ask")
MAX_ROUNDS = 4

SYSTEM = """You are LineReady Ask, a read-only assistant for licensed A320-family line engineers at Sharjah.
Use the tools to look up facts. Answer only from tool results.
- Cite the evidence ids (e.g. tsm:..., wo:..., pha:..., stock:...) that support each statement.
- If the tools do not contain the answer, say it was not found in the controlled data. Do not guess.
- Never diagnose a root cause: name TSM isolation tasks and TSM-listed possible causes instead.
- Never sign, defer, release or certify anything, and never tell the engineer they may.
- Keep answers short: at most 120 words, plain engineer language.
When finished, reply with the final JSON only."""

TOOLS = [
    {"name": "find_tsm_tasks", "strict": True,
     "description": "Find TSM troubleshooting tasks for a fault message or defect text. Uses the TSM fault index, "
                    "the fleet's history of which tasks engineers used, and meaning-based search. Give the aircraft "
                    "registration when known: tasks whose effectivity excludes it are removed.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["text", "ata", "reg"],
                      "properties": {"text": {"type": "string", "description": "ECAM/CMS message or defect text"},
                                     "ata": {"type": "string", "description": "ATA like '34-52' or '' if unknown"},
                                     "reg": {"type": "string", "description": "e.g. A6-AOJ, or '' if unknown"}}}},
    {"name": "get_tsm_task", "strict": True,
     "description": "Read one TSM or AMM task: title, possible causes (TSM), referenced AMM tasks, tools and "
                    "expendable parts (AMM), and the start of the procedure.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["task_id"],
                      "properties": {"task_id": {"type": "string", "description": "e.g. 32-42-00-810-923-A"}}}},
    {"name": "aircraft_history", "strict": True,
     "description": "Pilot and maintenance defect reports for one aircraft. Filter by ATA prefix (use the 2-digit "
                    "chapter like '34' for a broad search) and/or keywords found in the defect text.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["reg", "ata", "keywords"],
                      "properties": {"reg": {"type": "string", "description": "e.g. A6-AOJ"},
                                     "ata": {"type": "string", "description": "prefix e.g. '34' or '32-42', '' for all"},
                                     "keywords": {"type": "string", "description": "e.g. 'GPS' or 'BRAKE TEMP', '' for none"}}}},
    {"name": "open_items", "strict": True,
     "description": "Open defects, open predictive (PHA) cases and recent aircraft fault messages for one aircraft.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["reg"],
                      "properties": {"reg": {"type": "string"}}}},
    {"name": "similar_fleet_defects", "strict": True,
     "description": "Closed defects on other aircraft similar to a description, with the action taken.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["text", "ata"],
                      "properties": {"text": {"type": "string"}, "ata": {"type": "string"}}}},
    {"name": "stock_check", "strict": True,
     "description": "Stores stock for a part number (station stores SHJLINE/SHJMAIN), and tool store for tool P/Ns.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["part_number"],
                      "properties": {"part_number": {"type": "string"}}}},
]

ANSWER_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["answer", "citations", "found"],
    "properties": {"answer": {"type": "string"}, "citations": {"type": "array", "items": {"type": "string"}},
                   "found": {"type": "boolean"}},
}


def _wo(w: dict) -> dict:
    return {"id": f"wo:{w['wo_number']}", "reg": w["reg"], "type": w["wo_type"], "opened": str(w["date_opened"]),
            "state": w.get("state"), "ata": w.get("ata"), "defect": (w["description"] or "")[:180],
            "last_action": (w.get("actions") or "").split(" | ")[-1][:200]}


def run_tool(name: str, args: dict) -> list[dict] | dict:
    if name == "find_tsm_tasks":
        out = []
        ac = search.aircraft((args.get("reg") or "").upper()) if args.get("reg") else None
        for h in search.tsm_candidates(args["text"], args["text"], args.get("ata") or None,
                                       before=settings.demo_now.date(), cec=ac["cec"] if ac else None):
            t = search.task(h["task_id"])
            if t:
                out.append({"id": f"tsm:{t['task_id']}", "title": t["title"], "found_by": h["match"],
                            "similar_past_cases": len(h.get("support") or []), "revision": t["revision"]})
        return out
    if name == "get_tsm_task":
        t = search.task(args["task_id"].strip())
        if not t:
            a = search.amm_task(args["task_id"].strip())
            if not a:
                return {"error": "task not found in the controlled TSM or AMM"}
            return {"id": f"amm:{a['task_id']}", "title": a["title"], "revision": f"AMM TSN 86 {a['revdate']}",
                    "effectivity": a["effrg"], "tools": a["tools"][:8], "expendable_parts": a["parts"][:8],
                    "procedure_start": (a["body"] or "")[:1200]}
        return {"id": f"tsm:{t['task_id']}", "title": t["title"], "revision": f"{t['revision']} {t['revdate']}",
                "effectivity": t["effrg"], "possible_causes": t["causes"][:8],
                "referenced_tasks": t["refs"][:8], "procedure_start": (t["body"] or "")[:1200]}
    if name == "aircraft_history":
        ata = (args.get("ata") or "").strip()[:5]
        kw = [w for w in search.keywords(args.get("keywords") or "", 4)]
        rows = query("""SELECT wo_number, reg, wo_type, date_opened, state, ata, description, actions FROM work_order
                        WHERE reg = %s AND wo_type IN ('PIREP','MAREP') AND (%s = '' OR ata LIKE %s || '%%')
                        AND (cardinality(%s::text[]) = 0 OR description ILIKE ANY (%s::text[]))
                        ORDER BY date_opened DESC LIMIT 8""",
                     (args["reg"].upper(), ata, ata, kw, [f"%{w}%" for w in kw]))
        return [_wo(r) for r in rows]
    if name == "open_items":
        reg = args["reg"].upper()
        wos = query("""SELECT wo_number, reg, wo_type, date_opened, state, ata, description, actions FROM work_order
                       WHERE reg = %s AND state = 'Open' AND wo_type IN ('PIREP','MAREP')
                       ORDER BY date_opened DESC LIMIT 8""", (reg,))
        pha = query("SELECT case_id, title, severity, opened FROM pha_case WHERE reg = %s AND status = 'OPEN'", (reg,))
        faults = query("""SELECT message, count(*) n, max(occurred_at) last FROM fault_event WHERE reg = %s
                          AND occurred_at > %s::timestamp - interval '72 hours' GROUP BY message
                          ORDER BY n DESC LIMIT 8""", (reg, settings.demo_now))
        return {"open_defects": [_wo(w) for w in wos],
                "predictive_cases": [{"id": f"pha:{p['case_id'][:8]}", "title": p["title"], "severity": p["severity"],
                                      "opened": str(p["opened"]), "note": "read only, as reported by AVIATAR"} for p in pha],
                "fault_messages_72h": [{"id": f"aviatar:{reg}:{f['message']}", "message": f["message"], "count": f["n"],
                                        "last": str(f["last"])} for f in faults]}
    if name == "similar_fleet_defects":
        return [_wo(w) for w in search.similar_defects(args["text"], args.get("ata") or None, limit=5)]
    if name == "stock_check":
        pn = args["part_number"].strip().upper()
        tools = search.tool_for(pn)
        if tools:
            return [{"id": f"tool:{t['tool_id']}", "pn": t["pn"], "description": t["description"],
                     "store": t["store"], "location": t["location"]} for t in tools]
        return [{"id": f"stock:{pn}", "store": s["store"], "location": s["location"], "description": s["description"],
                 "qty": float(s["qty"] or 0), "condition": s["cond"] or "-"} for s in search.stock_for(pn)[:6]]
    return {"error": f"unknown tool {name}"}


def _ids(obj) -> set[str]:
    found = set()
    if isinstance(obj, dict):
        if isinstance(obj.get("id"), str):
            found.add(obj["id"])
        for v in obj.values():
            found |= _ids(v)
    elif isinstance(obj, list):
        for v in obj:
            found |= _ids(v)
    return found


def ask(question: str, engineer_id: str, session_id: str | None = None) -> dict:
    c = client()
    if c is None:
        return {"answer": "Ask needs the Claude API key (ANTHROPIC_API_KEY).", "citations": [], "found": False}
    session_id = session_id or uuid.uuid4().hex[:12]
    row = query_one("SELECT turns FROM ask_session WHERE session_id = %s", (session_id,))
    turns = (row["turns"] if row else [])[-3:]                       # short-term memory: last 3 Q/A, text only
    history = "".join(f"Earlier Q: {t['q']}\nEarlier A: {t['a']}\n" for t in turns)
    messages = [{"role": "user", "content": (history + "\nQuestion: " + question).strip()}]
    seen: set[str] = set()
    tools_used: list[str] = []
    before = dict(USAGE)
    result = None
    for _ in range(MAX_ROUNDS + 1):
        try:
            resp = c.messages.create(
                model=settings.llm_model, max_tokens=4000, system=SYSTEM, tools=TOOLS,
                cache_control={"type": "ephemeral"},
                output_config={"effort": "medium", "format": {"type": "json_schema", "schema": ANSWER_SCHEMA}},
                messages=messages)
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
            log.error("ask failed: %s", e)
            return {"answer": "The assistant is unavailable right now. Use the brief and the manual viewer.",
                    "citations": [], "found": False, "session_id": session_id}
        _track(resp)
        if resp.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    tools_used.append(block.name)
                    try:
                        out = run_tool(block.name, block.input)
                    except Exception as e:  # tool failures go back to the model, never crash the answer
                        out = {"error": str(e)[:200]}
                    seen |= _ids(out)
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": json.dumps(out, default=str)[:6000]})
            messages.append({"role": "user", "content": results})
            continue
        text = "".join(b.text for b in resp.content if b.type == "text")
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            result = None
        break
    if not result:
        result = {"answer": "No answer could be produced within the lookup budget. Try a more specific question.",
                  "citations": [], "found": False}
    removed = [cid for cid in result["citations"] if cid not in seen]                       # R2
    result["citations"] = [cid for cid in result["citations"] if cid in seen]
    problems = lint(result["answer"])                                                         # R3a
    if problems:
        result = {"answer": "The draft answer was blocked by the guardrail check (" + "; ".join(problems) +
                  "). Please consult the TSM task directly.", "citations": result["citations"], "found": False}
    result.update(session_id=session_id, tools_used=tools_used, removed_citations=removed,
                  tokens={"in": USAGE["input_tokens"] - before["input_tokens"],
                          "out": USAGE["output_tokens"] - before["output_tokens"]})
    turns.append({"q": question[:300], "a": result["answer"][:600]})
    with connect() as conn:
        conn.execute("""INSERT INTO ask_session (session_id, engineer_id, turns) VALUES (%s,%s,%s)
                        ON CONFLICT (session_id) DO UPDATE SET turns = EXCLUDED.turns, updated = now()""",
                     (session_id, engineer_id, Jsonb(turns[-3:])))
    audit.record(engineer_id, "ask", f"session:{session_id}",
                 {"question": question, "answer": result["answer"], "citations": result["citations"],
                  "removed_citations": removed, "tools": tools_used})
    return result
