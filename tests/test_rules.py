"""Unit tests for the deterministic rules. Examples are real AMOS action texts from the data pack."""
from datetime import date, datetime

from lineready.domain.rules import deadline as dl
from lineready.domain.rules.policy import lint
from lineready.domain.rules.repetitive import rep01_sector_window, rep02_logbook

WO_6185232 = (
    "[30-May-2026] DUE NIL SPARES NSI RAISED AS PER TPM 05.49 AND MCC APPROVAL FORM 093.26 NSI DEFERRAL CARRIED OUT "
    "FOR 120 DAYS. | [26-Sep-2026] AS PER HOE APPROVAL ADD HAS BEEN EXTENDED UNTILL 31 OCT 2026,DUE TO AWAITING PART "
    "AVAILABLE. | [20-Oct-2026] CONTINUE DEFER DUE TO NIL SPARE ... CONTINUED DEFER TILL 31/OCT/2026 | "
    "[31-Oct-2026] ADD EXTENDED FOR 120 DAYS")


def test_latest_extension_wins():
    d = dl.extract_deadline(WO_6185232)
    assert d.deadline == date(2027, 2, 28)
    assert d.method == "days_from_action"


def test_explicit_month_name_date():
    d = dl.extract_deadline("[26-Sep-2026] ADD HAS BEEN EXTENDED UNTILL 31 OCT 2026,DUE TO AWAITING PART")
    assert d.deadline == date(2026, 10, 31)


def test_numeric_date():
    d = dl.extract_deadline("[14-Nov-2026] DUE TO NIL TIME,MEL 70-00-02A INVOKED CAT C ,VALID TILL 24/11/2026")
    assert d.deadline == date(2026, 11, 24)


def test_mel_category_fallback():
    d = dl.extract_deadline("[12-Nov-2026] FOR RECTIFICATION WHEN GROUND TIME AVAIL MDD RAISED. MEL 33-20-01-A CAT C")
    assert d.deadline == date(2026, 11, 22) and d.method == "mel_category"


def test_no_deferral_text():
    assert dl.extract_deadline("[01-Nov-2026] REPLACED LAV MIRROR IAW AMM 25-45-13-400-001-A") is None


def test_evaluate():
    d = dl.Deadline(date(2026, 11, 20), "", date(2026, 11, 1), "explicit_date")
    assert dl.evaluate(d, datetime(2026, 11, 20, 21), None) == "due_soon"  # valid to end of that day
    assert dl.evaluate(d, datetime(2026, 11, 21, 1), None) == "expired"
    d2 = dl.Deadline(date(2026, 11, 21), "", date(2026, 11, 1), "explicit_date")
    assert dl.evaluate(d2, datetime(2026, 11, 20, 21), datetime(2026, 11, 22, 2)) == "before_departure"


def test_rep01():
    sectors = [f"F{i}" for i in range(12)]
    assert rep01_sector_window(sectors, {"F9", "F10", "F11"}).hit
    assert not rep01_sector_window(sectors, {"F0", "F1", "F11"}).hit  # F0, F1 outside last 10


def test_rep02():
    as_of = date(2026, 11, 20)
    assert rep02_logbook([date(2026, 11, 10), date(2026, 11, 15), date(2026, 11, 19)], as_of).hit
    assert not rep02_logbook([date(2026, 10, 1), date(2026, 11, 15), date(2026, 11, 19)], as_of).hit


def test_policy_linter():
    assert lint("The aircraft is released for flight.")
    assert lint("The root cause is the safety valve.")
    assert lint("You can defer this item.")
    assert not lint("TSM 32-42-00-810-923-A lists the safety valves as possible causes to isolate.")


def test_effectivity():
    from lineready.domain.rules.effectivity import applies
    assert applies(336, "001999") is True
    assert applies(336, "051100 151200 203302 305337") is True      # inside 305-337
    assert applies(338, "051100 151200 203302 305337") is False
    assert applies(None, "001999") is None and applies(336, "") is None
