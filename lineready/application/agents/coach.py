"""Coach agent: the trainee prepares the dossier; the agent grades it against the hidden answer key.

The answer key is the verified dossier from the latest brief. Grading of the TSM task and parts is
deterministic. Claude writes Socratic feedback only (one low-effort call, cached): it asks guiding
questions and points to the manual page, without giving the answer away.
"""
from __future__ import annotations

import re

from psycopg.types.json import Jsonb

from lineready.infrastructure.llm.claude_adapter import json_call
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one

TASK = re.compile(r"\d{2}-\d{2}-\d{2}-\d{3}-[0-9A-Z]{3}")
PN = re.compile(r"[A-Z0-9][A-Z0-9\-./]{3,24}")

FEEDBACK_SYSTEM = """You coach a trainee aircraft maintenance technician (A320 family) who is learning to prepare
for a defect before troubleshooting. You see the answer key and the trainee's preparation.
- Do NOT reveal the answer key's task numbers or part numbers outright. Ask 1-3 guiding questions instead.
- Praise what is correct, specifically. Point to WHERE to look (TSM fault index, the aircraft's history, IPC),
  naming the manual by its chapter (e.g. "TSM chapter 34-52") rather than the exact task.
- Never diagnose a root cause. Never suggest signing, deferring or releasing anything.
- At most 110 words."""

FEEDBACK_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["well_done", "questions", "look_at"],
                   "properties": {"well_done": {"type": "string"},
                                  "questions": {"type": "array", "items": {"type": "string"}},
                                  "look_at": {"type": "array", "items": {"type": "string"}}}}


def _latest_brief(engineer_id: str) -> dict | None:
    row = query_one("SELECT brief_id, payload FROM brief WHERE engineer_id = %s ORDER BY brief_id DESC LIMIT 1",
                    (engineer_id,))
    return {**row["payload"], "brief_id": row["brief_id"]} if row else None


def _answer_key(d: dict) -> dict:
    tasks = sorted({e[4:] for e in d["evidence"] if e.startswith("tsm:")})
    parts = sorted({e.split(":", 1)[1] for e in d["evidence"] if e.startswith(("stock:", "tool:"))})
    history = sorted({e[3:] for e in d["evidence"] if e.startswith("wo:")})
    return {"tasks": tasks, "parts": parts, "history": history, "flags": [f["rule_id"] for f in d["flags"]]}


def exercises(engineer_id: str) -> list[dict]:
    """Dossiers with a TSM answer key, shown as symptom only."""
    b = _latest_brief(engineer_id)
    if not b:
        return []
    out = []
    for d in b["dossiers"]:
        key = _answer_key(d)
        if key["tasks"]:
            out.append({"brief_id": b["brief_id"], "item_id": d["item_id"], "reg": d["reg"], "ata": d["ata"],
                        "title": d["title"], "symptom": [c["text"] for c in d["symptom"]]})
    return out[:8]


def grade(trainee: str, engineer_id: str, item_id: str, tsm_task: str, history_notes: str, parts: str) -> dict:
    b = _latest_brief(engineer_id)
    d = next((x for x in (b or {}).get("dossiers", []) if x["item_id"] == item_id), None)
    if not d:
        return {"error": "exercise not found; rebuild the brief first"}
    key = _answer_key(d)
    given_tasks = {t[:16] for t in TASK.findall(tsm_task.upper())}
    task_ok = bool(given_tasks & {t[:16] for t in key["tasks"]})
    chapter_ok = bool({t[:5] for t in given_tasks} & {t[:5] for t in key["tasks"]})
    given_parts = set(PN.findall(parts.upper()))
    parts_hit = sorted(given_parts & set(key["parts"]))
    hist_hit = sorted(set(re.findall(r"\d{7}", history_notes)) & set(key["history"]))
    flags_named = [f for f in key["flags"] if f.lower() in history_notes.lower() or
                   {"REP-01": "repet", "REP-02": "repet", "DEADLINE-01": "deadline", "PHA-01": "predict"}
                   .get(f, "~").lower() in history_notes.lower()]
    score = {"tsm_task": "correct" if task_ok else ("right chapter" if chapter_ok else "not yet"),
             "history_records_found": f"{len(hist_hit)} of {len(key['history'])}",
             "parts_found": f"{len(parts_hit)} of {len(key['parts'])}" if key["parts"] else "none needed",
             "flags_noticed": f"{len(flags_named)} of {len(key['flags'])}",
             "points": int(task_ok) * 4 + int(chapter_ok and not task_ok) * 2 + min(len(hist_hit), 3)
             + min(len(parts_hit), 2) + len(flags_named)}
    pack = (f"DEFECT: {d['reg']} {d['title']} (ATA {d['ata']})\n"
            f"ANSWER KEY (hidden from trainee): TSM tasks {key['tasks'][:3]}; history WOs {key['history'][:5]}; "
            f"parts/tools {key['parts'][:4]}; flags {key['flags']}\n"
            f"TRAINEE PREPARATION: TSM task: {tsm_task[:200]} | history notes: {history_notes[:400]} | "
            f"parts/tools: {parts[:200]}\nDETERMINISTIC GRADE: {score}")
    fb = json_call(FEEDBACK_SYSTEM, pack, FEEDBACK_SCHEMA, effort="low", max_tokens=1500, kind="coach") or {
        "well_done": "Preparation recorded.",
        "questions": ["Which TSM fault-index entry matches this exact message?",
                      "Has this aircraft reported the same ATA in the last sectors?"],
        "look_at": ["TSM fault index", "Aircraft history in AMOS"]}
    answers = {"tsm_task": tsm_task, "history_notes": history_notes, "parts": parts}
    with connect() as conn:
        conn.execute("""INSERT INTO coach_attempt (trainee, brief_id, item_id, answers, score, feedback)
                        VALUES (%s,%s,%s,%s,%s,%s)""",
                     (trainee, b["brief_id"], item_id, Jsonb(answers), Jsonb(score), Jsonb(fb)))
    audit.record(trainee, "coach_attempt", f"brief:{b['brief_id']}/{item_id}", {"score": score})
    reveal = task_ok   # the answer key is shown once the trainee got the task right
    return {"score": score, "feedback": fb, "answer_key": key if reveal else None}


def progress(trainee: str) -> list[dict]:
    return query("""SELECT ts, item_id, score FROM coach_attempt WHERE trainee = %s ORDER BY ts DESC LIMIT 20""",
                 (trainee,))
