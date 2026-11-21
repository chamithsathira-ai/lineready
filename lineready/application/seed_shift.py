"""Synthetic shift context for the demo night (SHJ, 20 Nov 2026 22:00-06:00).

The data pack has no flight schedule, roster or handover notes. These are
SYNTHETIC and labelled as such everywhere they appear. The tails were chosen
from the real data for tonight's interesting items (open PHA cases, MEL and
deferral deadlines, active AVIATAR faults). Handover notes are derived from
real AMOS work orders on each tail.
"""
from datetime import datetime, timedelta

from lineready.infrastructure.persistence.db import connect, query

ENGINEERS = [
    ("E1", "Engineer A", "Certifying engineer", "B1"),
    ("E2", "Engineer B", "Certifying engineer", "B1"),
    ("E3", "Engineer C", "Certifying engineer", "B1/B2"),
]
# (engineer, reg, arrival, departure, stand, outbound flight) -- synthetic
PLAN = [
    ("E1", "A6-AQP", "22:10", "23:20", "S12", "G9 501"),
    ("E1", "A6-AOJ", "23:05", "00:25", "S14", "G9 117"),
    ("E1", "A6-ARE", "01:15", "02:40", "S11", "G9 433"),
    ("E1", "A6-AQJ", "03:20", "04:35", "S12", "G9 245"),
    ("E2", "A6-ARM", "22:30", "23:45", "S16", "G9 061"),
    ("E2", "A6-ATG", "00:40", "01:55", "S15", "G9 381"),
    ("E2", "A6-AUL", "02:50", "04:05", "S16", "G9 552"),
    ("E3", "A6-AOH", "22:45", "00:05", "S18", "G9 132"),
    ("E3", "A6-AUJ", "01:30", "02:50", "S17", "G9 213"),
    ("E3", "A6-AQN", "04:10", "05:30", "S18", "G9 315"),
]
SHIFT_DAY = datetime(2026, 11, 20)


def _t(hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return SHIFT_DAY + timedelta(days=1 if h < 12 else 0, hours=h, minutes=m)


def seed() -> None:
    with connect() as conn:
        conn.execute("TRUNCATE engineer, shift_assignment, handover_note")
        for e in ENGINEERS:
            conn.execute("INSERT INTO engineer VALUES (%s,%s,%s,%s)", e)
        for eng, reg, arr, dep, stand, fl in PLAN:
            conn.execute("INSERT INTO shift_assignment VALUES (%s,%s,%s,%s,%s,%s)",
                         (eng, reg, _t(arr), _t(dep), stand, fl))
    for _eng, reg, *_ in PLAN:
        wo = query("""SELECT wo_number, wo_type, description, state, date_opened FROM work_order
                      WHERE reg = %s AND wo_type IN ('PIREP','MAREP') AND date_opened >= %s
                      ORDER BY date_opened DESC, wo_number DESC LIMIT 1""", (reg, SHIFT_DAY - timedelta(days=4)))
        if wo:
            w = wo[0]
            status = "left open for tonight" if w["state"] == "Open" else "closed"
            note = (f"[SYNTHETIC from AMOS WO {w['wo_number']}] Day shift worked {w['wo_type']} "
                    f"'{(w['description'] or '')[:90]}' — {status}.")
        else:
            note = "[SYNTHETIC] Nothing outstanding handed over on this aircraft."
        with connect() as conn:
            conn.execute("INSERT INTO handover_note VALUES (%s,%s,%s,%s)",
                         (reg, SHIFT_DAY + timedelta(hours=19, minutes=45), "Day shift (synthetic)", note))
    print(f"seeded {len(ENGINEERS)} engineers, {len(PLAN)} aircraft (SYNTHETIC schedule)")
