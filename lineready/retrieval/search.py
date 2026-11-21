"""Retrieval cascade: exact -> fuzzy -> hybrid (lexical + trigram, fused by RRF).

Exact keys always win. Lower tiers are labelled with the confidence class that
the UI shows, so the engineer knows how each reference was found.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta

from lineready.infrastructure.persistence.db import query, query_one

STOP = {"THE", "AND", "FOR", "WITH", "WAS", "FOUND", "CARRIED", "OUT", "AS", "PER", "IAW", "REF", "AMM", "TASK",
        "REV", "ON", "OF", "TO", "IN", "AT", "BY", "A", "AN", "IS", "ISSUED", "DURING", "NO"}
WORD = re.compile(r"[A-Z0-9][A-Z0-9\-/]{1,}")


# Aviation lexicon v1: logbook / ECAM abbreviations -> manual wording. Grows through the learning loop.
LEXICON = {
    "NAV": "NAVIGATION", "BKUP": "BACKUP", "SPD": "SPEED", "ENG": "ENGINE", "VLV": "VALVE", "PRESS": "PRESSURE",
    "TEMP": "TEMPERATURE", "HYD": "HYDRAULIC", "ELEC": "ELECTRICAL", "FWD": "FORWARD", "LH": "LEFT", "RH": "RIGHT",
    "L/H": "LEFT", "R/H": "RIGHT", "INOP": "INOPERATIVE", "XMTR": "TRANSMITTER", "XPDR": "TRANSPONDER",
    "ANT": "ANTENNA", "CTL": "CONTROL", "IND": "INDICATION", "SYS": "SYSTEM", "DISAGREE": "DISAGREE",
    "POS": "POSITION", "CRG": "CARGO", "ISOL": "ISOLATION", "COND": "CONDITIONING", "BRK": "BRAKE",
    "LGCIU": "LGCIU", "PAX": "PASSENGER", "LAV": "LAVATORY", "IGN": "IGNITION", "FLT": "FLIGHT", "CAB": "CABIN",
}


BOILERPLATE = re.compile(r"^\s*ENG(?:INEERING)?\s+ENTRY\s*:?|ISSUED BY\s*:.*$|AUTHORI[SZ]ED BY\s*:.*$|"
                         r"\bREF(?:ER)?\s+(?:TO\s+)?(?:CDL[B]?|CLB|CABIN LOG|LOG)\s*(?:NO\.?|#)?\s*[\d\-]+|"
                         r"\bTRANSFERRED FROM\s+\w+(?:\s+LOG)?\s*[\d\-]*|\bITEM\s*#?\d+|\bENTRY\s*#?\d+", re.I)


def clean(text: str) -> str:
    """Remove logbook boilerplate ('ENG ENTRY:', 'ISSUED BY: ...', 'REF CDL NO 123') before matching."""
    return re.sub(r"\s+", " ", BOILERPLATE.sub(" ", text or "")).strip()


def keywords(text: str, limit: int = 12) -> list[str]:
    seen: list[str] = []
    for w in WORD.findall((text or "").upper()):
        for t in (w, LEXICON.get(w)):
            if t and t not in STOP and t not in seen and not t.isdigit():
                seen.append(t)
    return seen[:limit]


GENERIC = {"FAULT", "FAILURE", "LOSS", "SYSTEM", "INDICATION", "LEFT", "RIGHT", "FORWARD", "AFT", "PASSENGER",
           "CABIN", "UNIT", "INOPERATIVE", "ENTRY", "DEFECT", "CHECK", "TEST", "OPERATIONAL", "LH", "RH", "FWD"}


def distinctive(text: str) -> set[str]:
    """Canonical, non-generic words: 'PAX' and 'PASSENGER' count once; 'FAULT' never counts."""
    out = set()
    for w in WORD.findall((text or "").upper()):
        c = LEXICON.get(w, w)
        if c not in STOP and c not in GENERIC and not c.isdigit() and len(c) > 2:
            out.add(c.rstrip("S") if len(c) > 4 else c)
    return out


def rrf(*rankings: list[str], k: int = 60) -> list[str]:
    """Reciprocal rank fusion: merge rankings without tuning scores."""
    score: dict[str, float] = defaultdict(float)
    for ranking in rankings:
        for i, key in enumerate(ranking):
            score[key] += 1.0 / (k + i + 1)
    return sorted(score, key=score.get, reverse=True)


# ---------- manuals ----------

def tsm_for_message(message: str, ata: str | None) -> list[dict]:
    """Fault message -> TSM tasks. Tier 1 exact, tier 2 CMS prefix, tier 3 trigram within ATA chapter."""
    msg = re.sub(r"\s+", " ", (message or "").upper()).strip()
    if not msg:
        return []
    rows = query("""SELECT DISTINCT ON (task_id) task_id, msg_raw, kind, 'exact' AS match
                    FROM tsm_fault_index WHERE msg = %s""", (msg,))
    if not rows:
        rows = query("""SELECT DISTINCT ON (task_id) task_id, msg_raw, kind, 'prefix' AS match
                        FROM tsm_fault_index WHERE msg LIKE %s || '/%%' OR msg LIKE %s || ' %%'
                        LIMIT 20""", (msg, msg))
    if not rows and ata:
        rows = query("""SELECT task_id, msg_raw, kind, 'fuzzy' AS match, sim FROM (
                          SELECT DISTINCT ON (task_id) task_id, msg_raw, kind, similarity(msg, %s) AS sim
                          FROM tsm_fault_index WHERE msg %% %s AND task_id LIKE %s
                          ORDER BY task_id, sim DESC) t
                        WHERE sim > 0.55 ORDER BY sim DESC LIMIT 5""", (msg, msg, ata[:2] + "-%"))
    return rows[:8]


def tsm_for_text(text: str, ata2: str | None, limit: int = 3) -> list[dict]:
    """Free text (PHA title, logbook defect) -> TSM tasks by title/body search. Lower confidence."""
    text = clean(text)
    kws = keywords(text, 8)
    if not kws:
        return []
    q = " | ".join(kws)
    chap = (ata2 or "")[:2]
    lex = query("""SELECT task_id FROM manual_task
                   WHERE tsv @@ to_tsquery('english', %s) AND (%s = '' OR task_id LIKE %s || '-%%')
                   ORDER BY ts_rank(tsv, to_tsquery('english', %s)) DESC LIMIT 20""",
                (q, chap, chap, q))
    tri = query("""SELECT task_id FROM manual_task
                   WHERE (%s = '' OR task_id LIKE %s || '-%%') AND title %% %s
                   ORDER BY similarity(title, %s) DESC LIMIT 20""", (chap, chap, text, text))
    ids = rrf([r["task_id"] for r in lex], [r["task_id"] for r in tri])[:10]
    if not ids:
        return []
    # precision guard: a text match must share at least 2 distinctive words (canonical form) with the task title
    titles = {r["task_id"]: r["title"] or "" for r in query(
        "SELECT task_id, title FROM manual_task WHERE task_id = ANY(%s)", (ids,))}
    want = distinctive(text)
    good = [t for t in ids if len(want & distinctive(titles.get(t, ""))) >= 2]
    return [{"task_id": t, "match": "text_search"} for t in good[:limit]]


CITED_TSM = re.compile(r"TSM\s*(?:TASK\s*)?[:\-]?\s*(\d{2}-\d{2}-\d{2}-\d{3}-[0-9A-Z]{3})")


MIN_CASE_SIM = 0.2


def tsm_from_cases(text: str, ata: str | None, before: date | None = None, exclude_wo: str | None = None,
                   k_cases: int = 25) -> list[dict]:
    """Fleet memory: which TSM tasks did engineers cite on similar past defects?

    Similar closed PIREP/MAREP cases are found with hybrid lexical + trigram search (RRF). Each case
    votes for the TSM tasks cited in its actions, weighted by its rank. Only cases opened before
    `before` are used, so the backtest never sees the future.
    """
    text = clean(text)
    kws = keywords(text, 10)
    if not kws:
        return []
    q = " | ".join(kws)
    chap = (ata or "")[:2]
    base = """FROM case_memory WHERE chap = %(chap)s AND wo_number <> coalesce(%(ex)s, '')
              AND (%(before)s::date IS NULL OR date_opened < %(before)s::date)"""
    p = {"chap": chap, "ex": exclude_wo, "before": before, "q": q, "t": text[:300]}
    lex = query(f"SELECT wo_number, tasks, similarity(description, %(t)s) sim {base} AND tsv @@ to_tsquery('english', %(q)s) "
                f"ORDER BY ts_rank(tsv, to_tsquery('english', %(q)s)) DESC LIMIT 40", p)
    tri = query(f"SELECT wo_number, tasks, similarity(description, %(t)s) sim {base} AND description %% %(t)s "
                f"ORDER BY similarity(description, %(t)s) DESC LIMIT 40", p)
    lex = [r for r in lex if r["sim"] >= MIN_CASE_SIM]   # a case must actually resemble this defect
    tasks_of = {r["wo_number"]: r["tasks"] for r in lex + tri}
    ids = rrf([r["wo_number"] for r in lex], [r["wo_number"] for r in tri])[:k_cases]
    votes: dict[str, float] = defaultdict(float)
    support: dict[str, list[str]] = defaultdict(list)
    for rank, wo in enumerate(ids):
        for t16 in tasks_of[wo]:
            votes[t16] += 1.0 / (rank + 3) / len(tasks_of[wo])   # multi-item work orders split their vote
            support[t16].append(wo)
    if not votes:
        return []
    real = {r["k"]: r["task_id"] for r in query(
        "SELECT DISTINCT ON (left(task_id,16)) left(task_id,16) k, task_id FROM manual_task WHERE left(task_id,16) = ANY(%s)",
        (list(votes),))}
    ranked = sorted((t for t in votes if t in real), key=votes.get, reverse=True)
    # precision guard: the suggested task must share a distinctive word with the defect
    # (multi-item cabin work orders otherwise "vote" for unrelated tasks, e.g. carpet -> oven)
    want = distinctive(text)
    titles = {r["task_id"]: r["title"] or "" for r in query(
        "SELECT task_id, title FROM manual_task WHERE task_id = ANY(%s)", ([real[t] for t in ranked],))}
    ranked = [t for t in ranked if len(support[t]) >= 2 or want & distinctive(titles.get(real[t], ""))]
    return [{"task_id": real[t], "match": "fleet_cases", "support": support[t][:5], "score": round(votes[t], 3)}
            for t in ranked]


def tsm_candidates(message: str | None, text: str, ata: str | None, before: date | None = None,
                   exclude_wo: str | None = None, k: int = 3) -> list[dict]:
    """Fused manual retrieval: fault index (exact keys) + fleet case memory + guarded text search, merged by RRF.
    Each result keeps how it was found, so the UI can show the right confidence."""
    idx = tsm_for_message(message, ata) if message else []
    cases = tsm_from_cases(text or message or "", ata, before, exclude_wo)
    txt = tsm_for_text(text or message or "", ata) if not idx and not cases else []
    case_rank = {h["task_id"]: i for i, h in enumerate(cases)}
    idx.sort(key=lambda h: case_rank.get(h["task_id"], 999))   # fault-index tasks ordered by fleet usage
    info: dict[str, dict] = {}
    for h in txt + cases + idx:            # later sources overwrite: index > cases > text
        info.setdefault(h["task_id"], {}).update(h)
    for h in cases:                        # keep case support even when the index also matched
        info[h["task_id"]]["support"] = h["support"]
    order = rrf([h["task_id"] for h in idx], [h["task_id"] for h in cases], [h["task_id"] for h in txt])
    return [info[t] for t in order[:k]]


def task(task_id: str) -> dict | None:
    return query_one("""SELECT t.*, d.revision FROM manual_task t LEFT JOIN manual_doc d ON d.doc = t.doc
                        WHERE task_id = %s""", (task_id,))


# ---------- history ----------

def tail_history(reg: str, ata4: str, before: date, days: int = 180, limit: int = 6) -> list[dict]:
    return query("""SELECT wo_number, reg, wo_type, date_opened, date_closed, ata, description, actions, state
                    FROM work_order WHERE reg = %s AND ata4 = %s AND wo_type IN ('PIREP','MAREP')
                    AND date_opened BETWEEN %s AND %s ORDER BY date_opened DESC LIMIT %s""",
                 (reg, ata4, before - timedelta(days=days), before, limit))


def similar_defects(text: str, ata: str | None, exclude_reg: str | None = None, limit: int = 3) -> list[dict]:
    """Fleet case memory: hybrid lexical + trigram over closed PIREP/MAREP defects, fused with RRF."""
    text = clean(text)
    kws = keywords(text, 10)
    if not kws:
        return []
    q = " | ".join(kws)
    chap = (ata or "")[:2]
    lex = query("""SELECT wo_number FROM work_order
                   WHERE wo_type IN ('PIREP','MAREP') AND state = 'Closed' AND ata4 LIKE %s || '%%'
                   AND reg <> coalesce(%s, '') AND tsv @@ to_tsquery('english', %s)
                   ORDER BY ts_rank(tsv, to_tsquery('english', %s)) DESC LIMIT 30""",
                (chap, exclude_reg, q, q))
    tri = query("""SELECT wo_number FROM work_order
                   WHERE wo_type IN ('PIREP','MAREP') AND state = 'Closed' AND ata4 LIKE %s || '%%'
                   AND reg <> coalesce(%s, '') AND description %% %s
                   ORDER BY similarity(description, %s) DESC LIMIT 30""",
                (chap, exclude_reg, text[:300], text[:300]))
    ids = rrf([r["wo_number"] for r in lex], [r["wo_number"] for r in tri])[:limit]
    if not ids:
        return []
    rows = {r["wo_number"]: r for r in query(
        """SELECT wo_number, reg, wo_type, date_opened, date_closed, ata, ata4, description, actions, state
           FROM work_order WHERE wo_number = ANY(%s)""", (ids,))}
    return [rows[i] for i in ids if i in rows]


def recurrence_after(reg: str, ata4: str | None, closed: date | None, days: int = 10) -> str:
    """Telemetry outcome label: did AVIATAR show the same ATA again after the WO closed?"""
    if not closed or not ata4:
        return "unknown"
    span = query_one("SELECT min(occurred_at)::date lo, max(occurred_at)::date hi FROM fault_event WHERE reg = %s",
                     (reg,))
    if not span or not span["lo"] or closed < span["lo"] or closed + timedelta(days=days) > span["hi"]:
        return "no_telemetry"
    row = query_one("""SELECT count(DISTINCT flight) n FROM fault_event WHERE reg = %s AND ata4 = %s
                       AND occurred_at > %s AND occurred_at <= %s::date + %s""",
                    (reg, ata4, closed, closed, days))
    return "recurred" if row and row["n"] >= 2 else "no_recurrence_seen"


# ---------- logistics ----------

PN = re.compile(r"\bP/?N\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-./]{3,24})", re.I)


def part_numbers(text: str) -> list[str]:
    out = []
    for p in PN.findall(text or ""):
        p = p.strip(".-/").upper()
        if p not in out and any(c.isdigit() for c in p):
            out.append(p)
    return out


def stock_for(pn: str) -> list[dict]:
    return query("""SELECT store, location, pn, description, cond, sum(qty) qty FROM stock_lot
                    WHERE upper(pn) = %s GROUP BY store, location, pn, description, cond
                    ORDER BY store DESC""", (pn.upper(),))


def tool_for(pn: str) -> list[dict]:
    return query("""SELECT tool_id, pn, description, store, location, expires FROM tool WHERE upper(pn) = %s
                    LIMIT 5""", (pn.upper(),))
