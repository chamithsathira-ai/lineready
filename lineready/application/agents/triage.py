"""Triage agent: groups AVIATAR fault messages into symptom episodes and applies REP-01.

Pure code, no LLM. ~376k raw rows become a handful of episodes per tail.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from functools import lru_cache

from lineready.domain.rules.registry import RULES
from lineready.domain.rules.repetitive import rep01_sector_window
from lineready.infrastructure.persistence.db import query

PRIO_SCORE = {"HIGH": 40, "MEDIUM": 25, "LOW": 10, "NONE": 5, "UNDEFINED": 5, "OK": 0}


def episode_id(reg: str, message: str) -> str:
    return f"ep:{reg}:{hashlib.sha1(message.encode()).hexdigest()[:8]}"


def sector_flights(reg: str, until: datetime, days: int = 30) -> list[str]:
    """The tail's flights seen in AVIATAR, oldest first (proxy for sectors)."""
    rows = query("""SELECT flight, min(occurred_at) t FROM fault_event
                    WHERE reg = %s AND occurred_at BETWEEN %s AND %s AND flight IS NOT NULL
                    GROUP BY flight ORDER BY t""", (reg, until - timedelta(days=days), until))
    return [r["flight"] for r in rows]


FLEET_WIDE_SHARE = 0.25   # a message on >= 25% of active tails is a fleet pattern, not a tail defect


@lru_cache(maxsize=8)
def fleet_baseline(now: datetime, lookback_hours: int = 72) -> tuple[int, dict[str, int]]:
    """(active tails, {message: tails reporting it}) over the lookback window, fleet-wide."""
    since = now - timedelta(hours=lookback_hours)
    active = query("SELECT count(DISTINCT reg) n FROM fault_event WHERE occurred_at BETWEEN %s AND %s",
                   (since, now))[0]["n"]
    rows = query("""SELECT message, count(DISTINCT reg) tails FROM fault_event
                    WHERE occurred_at BETWEEN %s AND %s GROUP BY message""", (since, now))
    return active, {r["message"]: r["tails"] for r in rows}


def fleet_patterns(reg: str, now: datetime, lookback_hours: int = 72) -> list[dict]:
    """Fleet-wide messages this tail also reported: shown once, as information, never escalated."""
    active, counts = fleet_baseline(now, lookback_hours)
    rows = query("""SELECT message, count(DISTINCT flight) flights FROM fault_event
                    WHERE reg = %s AND occurred_at BETWEEN %s AND %s GROUP BY message""",
                 (reg, now - timedelta(hours=lookback_hours), now))
    return [{"message": r["message"], "flights": r["flights"], "fleet_tails": counts.get(r["message"], 0),
             "active_tails": active} for r in rows
            if active and counts.get(r["message"], 0) / active >= FLEET_WIDE_SHARE]


def episodes(reg: str, now: datetime, lookback_hours: int = 72, top: int = 3) -> list[dict]:
    rows = query("""SELECT message, msg_type, max(ata) ata, max(ata4) ata4, max(source) source,
                           count(*) n, count(DISTINCT flight) flights, array_agg(DISTINCT flight) flight_list,
                           min(occurred_at) first_seen, max(occurred_at) last_seen,
                           max(CASE prio WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 2 ELSE 1 END) p,
                           bool_or(repetitive) aviatar_rep
                    FROM fault_event
                    WHERE reg = %s AND occurred_at BETWEEN %s AND %s AND coalesce(prio,'') <> 'OK'
                    GROUP BY message, msg_type""", (reg, now - timedelta(hours=lookback_hours), now))
    if not rows:
        return []
    active, fleet_counts = fleet_baseline(now, lookback_hours)
    rows = [r for r in rows if not active or fleet_counts.get(r["message"], 0) / active < FLEET_WIDE_SHARE]
    sectors = sector_flights(reg, now)
    rule = RULES["REP-01"]
    out = []
    for r in rows:
        hit_flights = {x["flight"] for x in query(
            "SELECT DISTINCT flight FROM fault_event WHERE reg=%s AND message=%s AND occurred_at <= %s",
            (reg, r["message"], now))}
        rep = rep01_sector_window(sectors, hit_flights, **rule.params)
        prio = {4: "HIGH", 3: "MEDIUM", 2: "LOW"}.get(r["p"], "NONE")
        score = PRIO_SCORE[prio] + (30 if rep.hit else 0) + (10 if r["msg_type"] == "WARNING_MESSAGE" else 0) \
            + min(r["flights"], 5) * 3
        out.append({**r, "prio": prio, "rep": rep, "score": score, "episode_id": episode_id(reg, r["message"]),
                    "sectors_known": len(sectors)})
    out.sort(key=lambda e: e["score"], reverse=True)
    return out[:top]
