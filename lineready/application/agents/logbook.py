"""Logbook sign-off check (stretch goal): flags what is missing in a draft entry BEFORE the engineer signs.

Deterministic rules run first (free, explainable, each names its rule). An optional deep check sends
the entry and the referenced TSM task outline to Claude once (cached) to spot procedure steps that are
not recorded. The agent only checks: it never completes, signs or certifies the entry.
"""
from __future__ import annotations

import re

from psycopg.types.json import Jsonb

from lineready.infrastructure.llm.claude_adapter import json_call
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query_one
from lineready.retrieval import search

TASK_REF = re.compile(r"\b(TSM|AMM)\s*(?:TASK)?\s*[:#]?\s*(\d{2}-\d{2}-\d{2}-\d{3}-[0-9A-Z]{3}(?:-[A-Z])?)", re.I)
BARE_TASK = re.compile(r"\b\d{2}-\d{2}-\d{2}-\d{3}-[0-9A-Z]{3}\b")
REV = re.compile(r"\bREV(?:ISION)?\.?\s*[:\-]?\s*\d+", re.I)
PN = re.compile(r"\bP/?N\s*[:.\-]?\s*[A-Z0-9][A-Z0-9\-./]{3,}", re.I)
SN = re.compile(r"\bS/?N\s*[:.\-]?\s*[A-Z0-9][A-Z0-9\-./]{2,}", re.I)
REPLACE = re.compile(r"\b(REPLAC|REMOV|INSTALL|FITTED|CHANGED)", re.I)
TORQUE = re.compile(r"\bTORQU", re.I)
CAL = re.compile(r"\b(CAL(?:IBRATION)?|DUE DATE|DUE)\b", re.I)
TEST = re.compile(r"\b(OPS|OPERATIONAL|FUNCTIONAL|BITE|LEAK)\s*(TEST|CHECK|CHK)|\bSATIS|\bTEST(?:ED)?\s+(?:OK|SATIS)", re.I)
FOUND = re.compile(r"\b(FOUND|OBSERVED|INSPECTED|CHECKED|CARRIED OUT|PERFORMED|REPLACED|RESET)\b", re.I)

RULES = {
    "LOG-01": "Entry cites the manual task used (TSM/AMM task number)",
    "LOG-02": "Cited TSM task exists in the controlled TSM",
    "LOG-03": "Manual revision quoted",
    "LOG-04": "Part removal/installation records P/N and S/N (off and on)",
    "LOG-05": "Torque work records tool P/N and calibration due date",
    "LOG-06": "Test or check after the work is recorded with its result",
    "LOG-07": "Entry states the work performed or finding",
}

DEEP_SYSTEM = """You check a draft aircraft technical log entry against the outline of the TSM task it cites.
List only concrete items that the entry does not record but the task outline requires (e.g. a test, a
reference to an AMM task that must be done, a part number). Each item must quote the outline line it comes from.
Do not rewrite the entry, do not judge airworthiness, never say it can be signed or released. Max 5 items."""
DEEP_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["missing"],
               "properties": {"missing": {"type": "array", "items": {
                   "type": "object", "additionalProperties": False, "required": ["item", "from_outline"],
                   "properties": {"item": {"type": "string"}, "from_outline": {"type": "string"}}}}}}


def check(entry: str, engineer_id: str, wo_number: str | None = None, deep: bool = False) -> dict:
    text = entry or ""
    findings: list[dict] = []

    def add(rule, ok, detail, page=None):
        findings.append({"rule_id": rule, "rule": RULES[rule], "ok": ok, "detail": detail, "manual_page": page})

    refs = [(m.upper(), t.upper()) for m, t in TASK_REF.findall(text)]
    if not refs:
        refs = [("?", t) for t in BARE_TASK.findall(text)]
    add("LOG-01", bool(refs), f"Found: {', '.join(f'{m} {t}' for m, t in refs)}" if refs
        else "No manual task number found. Record the TSM/AMM task used (e.g. 'IAW AMM 32-42-36-400-001').")

    tsm_pages = []
    for man, t in refs:
        if man in ("TSM", "?"):
            hit = query_one("SELECT task_id, title FROM manual_task WHERE left(task_id,16) = %s", (t[:16],))
            if hit:
                tsm_pages.append(hit["task_id"])
            elif man == "TSM":
                add("LOG-02", False, f"TSM {t} is not in the controlled TSM (TSN 86). Check the number.")
    if tsm_pages:
        add("LOG-02", True, "Verified in controlled TSM: " + ", ".join(tsm_pages), f"tsm:{tsm_pages[0]}")
    if any(m == "AMM" for m, _ in refs):
        findings.append({"rule_id": "LOG-02", "rule": RULES["LOG-02"], "ok": None,
                         "detail": "AMM task numbers are format-checked only (AMM not loaded in Round 1).",
                         "manual_page": None})

    add("LOG-03", bool(REV.search(text)), "Revision quoted." if REV.search(text)
        else "No revision quoted. Add the manual revision used (e.g. 'REV 86').")
    if REPLACE.search(text):
        pn, sn = len(PN.findall(text)), len(SN.findall(text))
        add("LOG-04", pn >= 2 and sn >= 2,
            f"Found {pn} P/N and {sn} S/N. A replacement needs P/N and S/N for the removed AND the installed part.")
    if TORQUE.search(text):
        add("LOG-05", bool(PN.search(text)) and bool(CAL.search(text)),
            "Torque work: record the torque wrench P/N, S/N and calibration due date.")
    add("LOG-06", bool(TEST.search(text)), "Test/check result recorded." if TEST.search(text)
        else "No test or check after the work is recorded (e.g. 'OPS TEST IAW ... SATIS').")
    add("LOG-07", bool(FOUND.search(text)), "Work/finding stated." if FOUND.search(text)
        else "State what was found and what was done.")

    deep_result = None
    if deep and tsm_pages:
        t = search.task(tsm_pages[0])
        outline = (f"TSM {t['task_id']} {t['title']} ({t['revision']})\nReferenced tasks: "
                   + "; ".join(f"{r['man']} {r['ref']} {r['title']}" for r in (t["refs"] or [])[:10])
                   + f"\nProcedure start: {(t['body'] or '')[:1500]}")
        deep_result = json_call(DEEP_SYSTEM, f"OUTLINE:\n{outline}\n\nDRAFT ENTRY:\n{text[:1500]}", DEEP_SCHEMA,
                                effort="low", max_tokens=1500, kind="logbook")
    gaps = [f for f in findings if f["ok"] is False]
    result = {"ready_for_engineer_review": not gaps, "gaps": len(gaps), "findings": findings,
              "deep_check": deep_result, "manual_pages": [f"tsm:{p}" for p in tsm_pages],
              "note": "LineReady checks the draft only. The certifying engineer completes and signs the entry."}
    with connect() as conn:
        conn.execute("INSERT INTO logbook_check (engineer_id, wo_number, entry_text, result) VALUES (%s,%s,%s,%s)",
                     (engineer_id, wo_number, text, Jsonb(result)))
    audit.record(engineer_id, "logbook_check", f"wo:{wo_number or '-'}", {"gaps": len(gaps),
                                                                        "rules_failed": [g["rule_id"] for g in gaps]})
    return result
