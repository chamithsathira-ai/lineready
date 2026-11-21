"""Shift Orchestrator (supervisor).

Fixed plan (DAG) per aircraft:
  collect candidates -> per-candidate dossier [Compliance, Triage, Manuals, Historian, Logistics]
  -> narrate + review (R1-R3) -> rank -> pin -> notify lead -> persist + audit

Aircraft run in parallel; the order of steps never changes, so a brief can be
replayed for an auditor.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from psycopg.types.json import Jsonb

from lineready.application.agents import triage
from lineready.application.agents.review import narrate_and_review
from lineready.application.agents.specialists import Compliance, Historian, Logistics, Manuals
from lineready.config import settings
from lineready.domain.model import (AircraftSlot, Brief, Claim, Confidence, Dossier, Evidence, Flag, Severity,
                                    to_dict)
from lineready.domain.rules.registry import RULES
from lineready.infrastructure.llm.claude_adapter import USAGE
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one
from lineready.retrieval import search

MAX_DOSSIERS_PER_TAIL = 4
SEV_SCORE = {Severity.CRITICAL: 400, Severity.WARNING: 40, Severity.INFO: 5}   # a critical flag always ranks first


# ---------------------------------------------------------------- dossier builders

def dossier_for_episodes(reg: str, group: list[dict], now: datetime) -> Dossier:
    """One dossier per symptom: related messages (same TSM system) are fused into one episode."""
    lead = max(group, key=lambda e: e["score"])
    title = " + ".join(e["message"] for e in group[:3])
    d = Dossier(lead["episode_id"], reg, "aviatar_episode", title, lead["ata"],
                score=lead["score"] + 5 * (len(group) - 1))
    for ep in group:
        flights = [f for f in ep["flight_list"] if f]
        src = f", source {ep['source']}" if ep["source"] else ""
        eid = d.add_evidence(Evidence(
            ep["episode_id"], "AVIATAR", f"AVIATAR {reg} '{ep['message']}'",
            excerpt=f"{ep['n']} occurrence(s) on {ep['flights']} flight(s) {', '.join(flights[:8])}; "
                    f"first {ep['first_seen']:%d %b %H:%M}, last {ep['last_seen']:%d %b %H:%M}; "
                    f"type {ep['msg_type']}{src}; priority {ep['prio']}"))
        d.symptom.append(Claim(
            f"{ep['msg_type'].replace('_', ' ').title()} '{ep['message']}' (ATA {ep['ata'] or '-'}{src}): "
            f"{ep['n']} occurrence(s) on {ep['flights']} flight(s) in the last 72 h, last at "
            f"{ep['last_seen']:%d %b %H:%M}. AVIATAR priority {ep['prio']}.", [eid], "fact", Confidence.EXACT))
        rep = ep["rep"]
        if rep.hit:
            rid = d.add_evidence(Evidence("rule:REP-01", "RULE", RULES["REP-01"].title,
                                          RULES["REP-01"].source + ". " + RULES["REP-01"].note))
            d.flags.append(Flag("REP-01", Severity.WARNING, f"Repetitive: {ep['message']}",
                                f"Seen on {rep.occurrences} of the last {rep.window} sectors "
                                f"({', '.join(rep.flights[-5:])})", [eid, rid]))
        Manuals().run(d, ep["message"], ep["message"], before=now.date())
    Historian().run(d, lead["message"], now)
    return d


def group_episodes(eps: list[dict]) -> list[list[dict]]:
    """Symptom fusion: messages whose TSM tasks sit in the same chapter-section belong to one system."""
    groups: dict[str, list[dict]] = {}
    for ep in eps:
        hits = search.tsm_for_message(ep["message"], ep["ata"])
        key = hits[0]["task_id"][:5] if hits else ep["message"]
        groups.setdefault(key, []).append(ep)
    return list(groups.values())


def dossier_for_pha(reg: str, case: dict, now: datetime) -> Dossier:
    d = Dossier(f"pha:{case['case_id'][:8]}", reg, "predictive_case", case["title"], str(case["ata"] or ""),
                score=35 if case["severity"] == "Alert" else 20)
    eid = d.add_evidence(Evidence(
        f"pha:{case['case_id'][:8]}", "PHA", f"AVIATAR PHA case {case['case_id'][:8]} · {case['use_case']}",
        excerpt=f"{case['title']} · severity {case['severity']} · impact {case['impact']} · opened {case['opened']} · "
                f"status {case['status']}", approved=False, url=case["link"]))
    d.symptom.append(Claim(
        f"Predictive case (read only, as reported by AVIATAR PHA): '{case['title']}', severity {case['severity']}, "
        f"impact {case['impact']}, open since {case['opened']:%d %b %H:%M}.", [eid], "information_only", Confidence.INFO))
    rid = d.add_evidence(Evidence("rule:PHA-01", "RULE", RULES["PHA-01"].title, RULES["PHA-01"].source))
    d.flags.append(Flag("PHA-01", Severity.WARNING if case["severity"] == "Alert" else Severity.INFO,
                        "Open predictive health case", f"{case['use_case']}: {case['title']}", [eid, rid]))
    Manuals().run(d, None, f"{case['title']} {case['use_case']}", before=now.date())
    Historian().run(d, f"{case['title']} {case['use_case']}", now)
    return d


def dossier_for_defect(wo: dict, now: datetime, departure: datetime | None) -> Dossier:
    d = Dossier(f"wo:{wo['wo_number']}", wo["reg"], "open_defect", (wo["description"] or "")[:110], wo["ata"],
                score=15)
    eid = d.add_evidence(Evidence(f"wo:{wo['wo_number']}", "AMOS",
                                  f"WO {wo['wo_number']} · {wo['reg']} · {wo['wo_type']} · {wo['date_opened']}",
                                  excerpt=((wo["description"] or "")[:300] + " || ACTIONS: " +
                                           (wo["actions"] or "")[-400:])))
    d.symptom.append(Claim(f"Open {wo['wo_type']} {wo['wo_number']} since {wo['date_opened']}: "
                           f"{(wo['description'] or '')[:200]}", [eid], "fact", Confidence.EXACT))
    Compliance().deadline(d, wo, now, departure)
    Manuals().run(d, None, wo["description"] or "", before=now.date())
    Historian().run(d, wo["description"] or "", now)
    return d


# ---------------------------------------------------------------- per-aircraft plan

def plan_aircraft(slot: AircraftSlot, now: datetime) -> tuple[list[Dossier], list[str]]:
    reg = slot.reg
    dossiers: list[Dossier] = []
    from lineready.domain.rules import deadline as dl
    open_wos = query("""SELECT wo_number, reg, wo_type, date_opened, ata, description, actions FROM work_order
                        WHERE reg = %s AND state = 'Open' AND wo_type IN ('PIREP','MAREP')
                        ORDER BY date_opened DESC""", (reg,))
    for wo in open_wos:
        found = dl.extract_deadline(wo["actions"] or "")
        recent = wo["date_opened"] and wo["date_opened"] >= (now - timedelta(days=7)).date()
        if (found and dl.evaluate(found, now, slot.departure) != "ok") or (recent and wo["wo_type"] == "PIREP"):
            dossiers.append(dossier_for_defect(wo, now, slot.departure))
    for case in query("SELECT * FROM pha_case WHERE reg = %s AND status = 'OPEN' ORDER BY opened DESC", (reg,)):
        dossiers.append(dossier_for_pha(reg, case, now))
    for group in group_episodes(triage.episodes(reg, now, top=6)):
        dossiers.append(dossier_for_episodes(reg, group, now))

    gaps: list[str] = []
    for d in dossiers:
        gaps += Logistics().run(d)
        d.score += sum(SEV_SCORE[f.severity] for f in d.flags)
    dossiers.sort(key=lambda d: d.score, reverse=True)
    return dossiers[:MAX_DOSSIERS_PER_TAIL], gaps


# ---------------------------------------------------------------- brief

def build_brief(engineer_id: str, now: datetime | None = None) -> dict:
    t0 = time.time()
    now = now or settings.demo_now
    usage_before = dict(USAGE)
    eng = query_one("SELECT * FROM engineer WHERE engineer_id = %s", (engineer_id,))
    if not eng:
        raise ValueError(f"unknown engineer {engineer_id}")
    slots = [AircraftSlot(r["reg"], r["arrival"], r["departure"], r["stand"], r["flight_out"])
             for r in query("SELECT * FROM shift_assignment WHERE engineer_id = %s ORDER BY arrival", (engineer_id,))]

    with ThreadPoolExecutor(max_workers=6) as pool:
        planned = list(pool.map(lambda s: plan_aircraft(s, now), slots))
    dossiers = [d for ds, _ in planned for d in ds]
    gaps = [g for _, gs in planned for g in gs]

    dossiers.sort(key=lambda d: d.score, reverse=True)
    # token budget: only the top items get an AI summary (+ critic); the rest use the template.
    top = {d.item_id for d in dossiers[:settings.llm_narrate_top]}
    with ThreadPoolExecutor(max_workers=4) as pool:   # narrator + critic, one dossier per worker
        list(pool.map(lambda d: narrate_and_review(d, d.item_id in top), dossiers))
    pinned = dossiers[0] if dossiers and dossiers[0].flags else None
    handover = query("SELECT reg, written_at, author, note FROM handover_note WHERE reg = ANY(%s)",
                     ([s.reg for s in slots],))
    stats = {
        "aircraft": len(slots), "dossiers": len(dossiers),
        "flags": sum(len(d.flags) for d in dossiers),
        "evidence_items": sum(len(d.evidence) for d in dossiers),
        "removed_by_review": sum(len(d.removed_by_review) for d in dossiers),
        "llm_enabled": settings.llm_enabled,
        "llm_calls": USAGE["calls"] - usage_before["calls"],
        "llm_input_tokens": USAGE["input_tokens"] - usage_before["input_tokens"],
        "llm_output_tokens": USAGE["output_tokens"] - usage_before["output_tokens"],
        "llm_cache_read_tokens": USAGE["cache_read_input_tokens"] - usage_before["cache_read_input_tokens"],
        "llm_response_cache_hits": USAGE.get("cache_hits", 0) - usage_before.get("cache_hits", 0),
        "build_seconds": round(time.time() - t0, 1),
    }
    brief = Brief(engineer_id, eng["name"], now, f"{settings.station} night shift · {now:%d %b %Y} 22:00–06:00",
                  slots, pinned, dossiers, handover, sorted(set(gaps)), stats)
    payload = to_dict(brief)
    payload["aircraft_types"] = {r["reg"]: r["ac_type"] for r in query(
        "SELECT reg, max(ac_type) ac_type FROM fault_event WHERE reg = ANY(%s) GROUP BY reg", ([s.reg for s in slots],))}
    payload["built_at"] = datetime.now().isoformat(timespec="seconds")
    payload["fleet_patterns"] = {s.reg: triage.fleet_patterns(s.reg, now) for s in slots}
    payload["synthetic_notice"] = ("Schedule, roster and handover notes are SYNTHETIC (not in the data pack). "
                                   "All other records come from the data pack.")
    with connect() as conn:
        row = conn.execute("INSERT INTO brief (engineer_id, as_of, payload) VALUES (%s,%s,%s) RETURNING brief_id",
                           (engineer_id, now, Jsonb(payload))).fetchone()
    payload["brief_id"] = row["brief_id"]
    audit.record("lineready", "brief_built", f"brief:{row['brief_id']}",
                 {"engineer": engineer_id, "as_of": now, "items": [d.item_id for d in dossiers],
                  "pinned": pinned.item_id if pinned else None, "stats": stats,
                  "removed_by_review": [r for d in dossiers for r in d.removed_by_review]})
    return payload
