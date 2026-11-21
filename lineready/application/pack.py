"""Aircraft pack: everything for one aircraft, ready before it lands.

Built automatically PACK_LEAD_MIN before arrival (a scheduler or CronJob calls refresh_due), and rebuilt when a
newer AVIATAR fault for that tail arrives. Deterministic: no LLM tokens. Re-uses the brief's per-aircraft plan.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from psycopg.types.json import Jsonb

from lineready.application.orchestrator import plan_aircraft
from lineready.config import settings
from lineready.domain.model import AircraftSlot, to_dict
from lineready.domain.rules import deadline as dl
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one
from lineready.retrieval import search

PACK_LEAD_MIN = 90
# Systems where small defects are often cleared during a turnaround (cabin, lights, water/waste, IFE).
MINOR_ATA = ("25", "33", "38", "44", "23", "35")


def _slot(reg: str) -> tuple[AircraftSlot, str] | None:
    r = query_one("SELECT * FROM shift_assignment WHERE reg = %s", (reg,))
    if not r:
        return None
    return AircraftSlot(r["reg"], r["arrival"], r["departure"], r["stand"], r["flight_out"]), r["engineer_id"]


def _clear_now(reg: str, exclude: set[str], ground_min: int, now: datetime) -> list[dict]:
    """Open minor defects with no deadline pressure that could be worked while the aircraft is on the ground."""
    out = []
    rows = query("""SELECT wo_number, wo_type, date_opened, ata, ata4, description, actions FROM work_order
                    WHERE reg = %s AND state = 'Open' AND wo_type IN ('PIREP','MAREP') AND left(ata, 2) = ANY(%s)
                    ORDER BY date_opened DESC""", (reg, list(MINOR_ATA)))
    for w in rows:
        if f"wo:{w['wo_number']}" in exclude:
            continue
        d = dl.extract_deadline(w["actions"] or "")
        status = dl.evaluate(d, now, None) if d else "none"
        if status in ("expired", "before_departure"):
            continue   # these are deadline items, already in the brief
        parts = []
        for pn in search.part_numbers(w["actions"] or "")[:3]:
            ok = any(l["store"] in ("SHJLINE", "SHJMAIN") and (l["cond"] or "") != "US" and (l["qty"] or 0) > 0
                     for l in search.stock_for(pn))
            parts.append({"pn": pn, "in_stock": ok})
        out.append({"wo": w["wo_number"], "type": w["wo_type"], "opened": str(w["date_opened"]), "ata": w["ata"],
                    "text": search.clean(w["description"] or "")[:160],
                    "deferral": f"limit {d.deadline:%d %b %Y}" if d else "no deferral limit in AMOS text",
                    "parts": parts, "evidence": [f"wo:{w['wo_number']}"],
                    "why": f"Minor system (ATA {w['ata']}), {ground_min} min on the ground"})
        if len(out) >= 5:
            break
    return out


def build_pack(reg: str, now: datetime | None = None, trigger: str = "manual") -> dict:
    now = now or settings.demo_now
    found = _slot(reg)
    if not found:
        raise ValueError(f"{reg} is not on tonight's shift")
    slot, engineer_id = found
    dossiers, gaps = plan_aircraft(slot, now)
    ground = int((slot.departure - slot.arrival).total_seconds() // 60) if slot.arrival and slot.departure else 0
    in_brief = {d.item_id for d in dossiers}
    manuals, parts, tools = {}, [], []
    for d in dossiers:
        for eid, ev in d.evidence.items():
            if eid.startswith(("tsm:", "amm:")):
                manuals[eid] = ev.label
        for c in d.readiness:
            (tools if any(e.startswith("tool:") for e in c.evidence_ids) else parts).append(
                {"text": c.text, "evidence": c.evidence_ids, "kind": c.kind})
    history = query("""SELECT wo_number, wo_type, date_opened, ata, description, state FROM work_order
                       WHERE reg = %s AND wo_type IN ('PIREP','MAREP') AND date_opened >= %s
                       ORDER BY date_opened DESC LIMIT 8""", (reg, (now - timedelta(days=7)).date()))
    last_fault = query_one("SELECT max(occurred_at) t FROM fault_event WHERE reg = %s AND occurred_at <= %s", (reg, now))
    ac = search.aircraft(reg)
    pack = {
        "reg": reg, "engineer_id": engineer_id, "built_at": now.isoformat(), "trigger": trigger,
        "arrival": slot.arrival.isoformat() if slot.arrival else None,
        "departure": slot.departure.isoformat() if slot.departure else None,
        "stand": slot.stand, "flight_out": slot.flight_out, "ground_minutes": ground,
        "aircraft": ac,
        "items": [to_dict(d) for d in dossiers],
        "clear_now": _clear_now(reg, in_brief, ground, now),
        "parts": parts[:12], "tools": tools[:8],
        "manual_pages": [{"ref": k, "label": v} for k, v in manuals.items()][:12],
        "history": [{**h, "date_opened": str(h["date_opened"]), "description": search.clean(h["description"] or "")[:160]}
                    for h in history],
        "gaps": gaps,
        "data_until": last_fault["t"].isoformat() if last_fault and last_fault["t"] else None,
    }
    with connect() as conn:
        conn.execute("INSERT INTO aircraft_pack (reg, engineer_id, built_at, arrival, data_until, payload) "
                     "VALUES (%s,%s,%s,%s,%s,%s)",
                     (reg, engineer_id, now, slot.arrival, last_fault["t"] if last_fault else None, Jsonb(pack)))
    audit.record("lineready", "pack_built", f"pack:{reg}", {"trigger": trigger, "at": now,
                                                            "items": len(pack["items"]), "clear_now": len(pack["clear_now"])})
    return pack


def latest(reg: str) -> dict | None:
    row = query_one("SELECT payload FROM aircraft_pack WHERE reg = %s ORDER BY id DESC LIMIT 1", (reg,))
    return row["payload"] if row else None


def refresh_due(now: datetime | None = None) -> list[dict]:
    """Build packs for aircraft landing within PACK_LEAD_MIN, or rebuild when a newer fault has arrived."""
    now = now or settings.demo_now
    built = []
    for s in query("SELECT reg, arrival FROM shift_assignment ORDER BY arrival"):
        if not s["arrival"] or not (now <= s["arrival"] <= now + timedelta(minutes=PACK_LEAD_MIN)):
            continue
        last = query_one("SELECT built_at, data_until FROM aircraft_pack WHERE reg = %s ORDER BY id DESC LIMIT 1",
                         (s["reg"],))
        newest = query_one("SELECT max(occurred_at) t FROM fault_event WHERE reg = %s AND occurred_at <= %s",
                           (s["reg"], now))
        stale = last and newest and newest["t"] and last["data_until"] and newest["t"] > last["data_until"]
        if not last or stale:
            build_pack(s["reg"], now, trigger="new fault" if stale else f"T-{PACK_LEAD_MIN} min")
            built.append({"reg": s["reg"], "reason": "new fault" if stale else "landing soon"})
    return built


def board(engineer_id: str, now: datetime | None = None) -> list[dict]:
    """Pack status for an engineer's aircraft: ready / building soon / scheduled."""
    now = now or settings.demo_now
    refresh_due(now)
    out = []
    for s in query("SELECT reg, arrival, departure, stand FROM shift_assignment WHERE engineer_id = %s ORDER BY arrival",
                   (engineer_id,)):
        last = query_one("SELECT built_at FROM aircraft_pack WHERE reg = %s ORDER BY id DESC LIMIT 1", (s["reg"],))
        mins = int((s["arrival"] - now).total_seconds() // 60) if s["arrival"] else None
        state = "ready" if last else ("due" if mins is not None and mins <= PACK_LEAD_MIN else "scheduled")
        out.append({"reg": s["reg"], "arrival": s["arrival"].isoformat() if s["arrival"] else None,
                    "departure": s["departure"].isoformat() if s["departure"] else None, "stand": s["stand"],
                    "minutes_to_arrival": mins, "state": state,
                    "built_at": last["built_at"].isoformat() if last else None,
                    "builds_at": (s["arrival"] - timedelta(minutes=PACK_LEAD_MIN)).isoformat() if s["arrival"] else None})
    return out
