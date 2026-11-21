"""End-of-shift handover, written from what actually happened in the shift.

Facts come from records (reviews with reasons, logbook checks, open flagged items, parts gaps, packs).
Claude writes only the short "next shift, first" paragraph (one cached call), and every sentence must cite
a record id from this handover (R2) and pass the guardrail linter (R3a). The engineer edits and saves it;
the saved text becomes the next shift's handover note and is written to the audit trail.
"""
from __future__ import annotations

from datetime import datetime

from lineready.config import settings
from lineready.domain.rules.policy import lint
from lineready.infrastructure.llm.claude_adapter import json_call
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one

SYSTEM = """You write the opening of an aircraft maintenance shift handover for the next shift's licensed engineers.
Use ONLY the records given. At most 4 sentences, at most 80 words: what the next shift should do first, in order of
urgency (deadlines, repetitive defects, parts gaps). Each sentence lists the record ids it relies on.
Never say anything is signed, released, deferred, cleared or airworthy. Never state a root cause."""
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["sentences"],
          "properties": {"sentences": {"type": "array", "items": {
              "type": "object", "additionalProperties": False, "required": ["text", "ids"],
              "properties": {"text": {"type": "string"}, "ids": {"type": "array", "items": {"type": "string"}}}}}}}


def draft(engineer_id: str) -> dict:
    b = query_one("SELECT brief_id, payload FROM brief WHERE engineer_id = %s ORDER BY brief_id DESC LIMIT 1",
                  (engineer_id,))
    if not b:
        return {"error": "No brief for this engineer yet."}
    brief, bid = b["payload"], b["brief_id"]
    reviews = {r["item_id"]: r for r in query(
        """SELECT DISTINCT ON (item_id) item_id, action, reason, ts FROM feedback WHERE brief_id = %s
           ORDER BY item_id, ts DESC""", (bid,))}
    checks = query("""SELECT wo_number, ts, result->>'gaps' gaps FROM logbook_check WHERE engineer_id = %s
                      ORDER BY ts DESC LIMIT 10""", (engineer_id,))
    packs = query("SELECT DISTINCT reg FROM aircraft_pack WHERE engineer_id = %s", (engineer_id,))
    aircraft = []
    for slot in brief["aircraft"]:
        reg = slot["reg"]
        items = [d for d in brief["dossiers"] if d["reg"] == reg]
        done, open_ = [], []
        for d in items:
            r = reviews.get(d["item_id"])
            flags = ", ".join(f["rule_id"] for f in d["flags"]) or "no flag"
            line = {"id": d["item_id"], "title": d["title"][:110], "flags": flags,
                    "deadline": next((f["title"] for f in d["flags"] if f["rule_id"] == "DEADLINE-01"), None)}
            if r:
                line.update(review=r["action"], reason=r["reason"] or "")
                done.append(line)
            else:
                open_.append(line)
        gaps = [g for g in brief.get("notify_lead", []) if g.startswith(reg)]
        aircraft.append({"reg": reg, "reviewed": done, "still_open": open_, "parts_gaps": gaps,
                         "pack_built": any(p["reg"] == reg for p in packs)})
    record_ids = {i["id"] for a in aircraft for i in a["reviewed"] + a["still_open"]}
    pack_lines = []
    for a in aircraft:
        for i in a["still_open"]:
            if i["deadline"] or "REP" in i["flags"]:
                pack_lines.append(f"[{i['id']}] {a['reg']} OPEN {i['flags']}: {i['title']}" + (f" ({i['deadline']})" if i["deadline"] else ""))
        for i in a["reviewed"]:
            pack_lines.append(f"[{i['id']}] {a['reg']} REVIEWED {i['review']} ({i['reason'] or 'no reason'}): {i['title']}")
        for g in a["parts_gaps"]:
            pack_lines.append(f"[gap:{a['reg']}] {g}")
            record_ids.add(f"gap:{a['reg']}")
    summary, removed = [], []
    out = json_call(SYSTEM, "\n".join(pack_lines[:40]) or "No open items.", SCHEMA, effort="low", max_tokens=1500,
                    kind="handover") if pack_lines else None
    for s in (out or {}).get("sentences", [])[:4]:
        if not s["ids"] or any(i not in record_ids for i in s["ids"]):
            removed.append({"text": s["text"], "reason": "R2: cites a record not in this handover"})
        elif lint(s["text"]):
            removed.append({"text": s["text"], "reason": "R3: " + "; ".join(lint(s["text"]))})
        else:
            summary.append(s)
    text_lines = ["NEXT SHIFT FIRST:"] + [f"- {s['text']}" for s in summary] if summary else []
    for a in aircraft:
        text_lines.append(f"\n{a['reg']}:")
        for i in a["still_open"]:
            text_lines.append(f"  OPEN  {i['title']} [{i['flags']}]" + (f" - {i['deadline']}" if i["deadline"] else ""))
        for i in a["reviewed"]:
            text_lines.append(f"  REVIEWED ({i['review']})  {i['title']}" + (f" - {i['reason']}" if i["reason"] else ""))
        for g in a["parts_gaps"]:
            text_lines.append(f"  PARTS  {g}")
    if checks:
        text_lines.append(f"\nLogbook entries checked this shift: {len(checks)} "
                          f"({sum(1 for c in checks if c['gaps'] and int(c['gaps']) > 0)} with gaps flagged).")
    return {"engineer_id": engineer_id, "brief_id": bid, "summary": summary, "removed": removed,
            "aircraft": aircraft, "logbook_checks": len(checks), "text": "\n".join(text_lines).strip(),
            "note": "Draft built from tonight's records. Review and edit before saving; you remain the author."}


def save(engineer_id: str, text: str) -> dict:
    now = datetime.now()
    with connect() as conn:
        for slot in query("SELECT reg FROM shift_assignment WHERE engineer_id = %s", (engineer_id,)):
            conn.execute("INSERT INTO handover_note VALUES (%s,%s,%s,%s)",
                         (slot["reg"], now, f"{engineer_id} (night shift)", text[:4000]))
    h = audit.record(engineer_id, "handover_saved", f"handover:{engineer_id}", {"text": text[:4000], "at": now})
    return {"ok": True, "audit_hash": h[:12], "saved_at": now.isoformat(timespec="seconds"),
            "station_clock_note": f"Demo clock {settings.demo_now:%d %b %H:%M}"}
