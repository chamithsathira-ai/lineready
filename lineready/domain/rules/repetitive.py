"""REP-01 / REP-02: repetitive defect detection. Pure functions."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class RepetitiveResult:
    hit: bool
    occurrences: int
    window: int
    flights: list[str]


def rep01_sector_window(sector_flights: list[str], hit_flights: set[str],
                        min_occurrences: int = 3, window_sectors: int = 10) -> RepetitiveResult:
    """sector_flights: the tail's flights, oldest -> newest. hit_flights: flights where the message occurred."""
    window = sector_flights[-window_sectors:]
    hits = [f for f in window if f in hit_flights]
    return RepetitiveResult(len(hits) >= min_occurrences, len(hits), len(window), hits)


def rep02_logbook(defect_dates: list[date], as_of: date,
                  min_occurrences: int = 3, window_days: int = 15) -> RepetitiveResult:
    """Same tail + same ATA: count PIREP/MAREP defects opened in the window."""
    start = as_of - timedelta(days=window_days)
    inside = [d for d in defect_dates if start <= d <= as_of]
    return RepetitiveResult(len(inside) >= min_occurrences, len(inside), window_days, [])
