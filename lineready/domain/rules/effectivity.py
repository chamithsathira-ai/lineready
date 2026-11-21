"""Effectivity: does a manual task apply to this aircraft?

Airbus manuals give effectivity as customer effectivity code (CEC) ranges, e.g. EFFRG="051100 151200 203302"
= CEC 051-100, 151-200, 203-302. Each aircraft's CEC comes from the manual's own fleet allocation table
(EFFDATA: registration, MSN, CEC), so this check uses controlled data only.
"""
from __future__ import annotations


def ranges(effrg: str | None) -> list[tuple[int, int]]:
    out = []
    for tok in (effrg or "").split():
        if len(tok) == 6 and tok.isdigit():
            out.append((int(tok[:3]), int(tok[3:])))
    return out


def applies(cec: int | None, effrg: str | None) -> bool | None:
    """True/False when both are known; None when effectivity cannot be decided (no CEC or no ranges)."""
    rs = ranges(effrg)
    if cec is None or not rs:
        return None
    return any(lo <= cec <= hi for lo, hi in rs)
