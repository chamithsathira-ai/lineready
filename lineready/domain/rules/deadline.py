"""DEADLINE-01: extract and evaluate deferral deadlines from AMOS action text.

AMOS stores deferral limits only as free text, for example:
  "[26-Sep-2026] AS PER HOE APPROVAL ADD HAS BEEN EXTENDED UNTILL 31 OCT 2026"
  "[30-May-2026] ... NSI DEFERRAL CARRIED OUT FOR 120 DAYS."
This module is pure and deterministic, so every deadline can be traced to the
exact sentence it came from.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

MONTHS = {m: i for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], start=1)}

ACTION_SPLIT = re.compile(r"\[(\d{2}-[A-Za-z]{3}-\d{4})\]\s*")
DEFER_WORDS = re.compile(r"\b(DEFER|DEFERRAL|DEFERRED|ADD RAISED|ADD HAS BEEN|NSI|DD RAISED|EXTENDED|EXTENSION|MEL)\b")
UNTIL_DATE = re.compile(
    r"\b(?:UNTIL+|TILL|UPTO|UP TO|VALID TILL|DUE)\s*[:\-]?\s*(\d{1,2})\s*[\s/\-.]?\s*"
    r"(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[\s/\-.,]?\s*(\d{4})")
UNTIL_NUMERIC = re.compile(
    r"\b(?:UNTIL+|TILL|UPTO|UP TO|VALID TILL|DUE)\s*[:\-]?\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b")
FOR_DAYS = re.compile(r"\bFOR\s+(\d{1,3})\s*(?:CALENDAR\s+)?DAYS\b")
MEL_CAT = re.compile(r"\bCAT(?:EGORY)?\s*[\"']?([BCD])\b")
MEL_CAT_DAYS = {"B": 3, "C": 10, "D": 120}  # MMEL preamble rectification intervals (calendar days)


@dataclass
class Deadline:
    deadline: date
    basis: str            # the sentence it came from
    action_date: date
    method: str           # explicit_date | days_from_action | mel_category


def split_actions(actions: str) -> list[tuple[date, str]]:
    """'[30-May-2026] text | [26-Sep-2026] text' -> [(date, text), ...] in order."""
    if not actions:
        return []
    parts = ACTION_SPLIT.split(actions)
    out = []
    for i in range(1, len(parts) - 1, 2):
        try:
            d = datetime.strptime(parts[i], "%d-%b-%Y").date()
        except ValueError:
            continue
        out.append((d, parts[i + 1].strip(" |")))
    return out


def extract_deadline(actions: str) -> Deadline | None:
    """Latest deferral statement wins (extensions supersede the original limit)."""
    found: Deadline | None = None
    for act_date, text in split_actions(actions):
        t = text.upper()
        if not DEFER_WORDS.search(t):
            continue
        candidates: list[Deadline] = []
        for d, mon, y in UNTIL_DATE.findall(t):
            try:
                candidates.append(Deadline(date(int(y), MONTHS[mon], int(d)), text[:240], act_date, "explicit_date"))
            except ValueError:
                pass
        for d, mo, y in UNTIL_NUMERIC.findall(t):
            try:
                candidates.append(Deadline(date(int(y), int(mo), int(d)), text[:240], act_date, "explicit_date"))
            except ValueError:
                pass
        for n in FOR_DAYS.findall(t):
            candidates.append(Deadline(act_date + timedelta(days=int(n)), text[:240], act_date, "days_from_action"))
        if not candidates and "MEL" in t:
            m = MEL_CAT.search(t)
            if m:
                candidates.append(Deadline(act_date + timedelta(days=MEL_CAT_DAYS[m.group(1)]), text[:240],
                                           act_date, "mel_category"))
        if candidates:
            best = max(candidates, key=lambda c: c.deadline)
            if found is None or act_date >= found.action_date:
                found = best
    return found


def evaluate(deadline: Deadline, now: datetime, departure: datetime | None, warn_hours: int = 168) -> str:
    """-> 'expired' | 'before_departure' | 'due_soon' | 'ok'. A deadline date is valid to the end of that day."""
    end = datetime.combine(deadline.deadline, datetime.max.time())
    if end < now:
        return "expired"
    if departure and end < departure:
        return "before_departure"
    if (end - now).total_seconds() <= warn_hours * 3600:
        return "due_soon"
    return "ok"
