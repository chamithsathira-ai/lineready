"""Versioned rule registry. Every flag the system raises names one of these rules.

Parameters marked CONFIRM must be checked against the company MOE/TPM before
real use. The data pack does not include the company procedure.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Rule:
    rule_id: str
    version: str
    title: str
    source: str
    params: dict = field(default_factory=dict)
    note: str = ""


RULES: dict[str, Rule] = {
    r.rule_id: r
    for r in [
        Rule(
            "REP-01", "1.0",
            "Repetitive fault message (aircraft-reported)",
            "CAR-M Issue 06 continuing-airworthiness tasks: monitor and highlight repetitive defects; "
            "threshold per company procedure (CONFIRM: 3 in 10 sectors from mentor session)",
            {"min_occurrences": 3, "window_sectors": 10},
            "Sectors are counted from flights seen in the AVIATAR fault data.",
        ),
        Rule(
            "REP-02", "1.0",
            "Repetitive pilot-reported defect (same ATA, same tail, PIREPs)",
            "CAR-M Issue 06 repetitive defect monitoring; window per company procedure (CONFIRM)",
            {"min_occurrences": 3, "window_days": 15},
        ),
        Rule(
            "DEADLINE-01", "1.0",
            "Deferred item deadline",
            "CAR-M Issue 06 deferred and carried-forward defects must be monitored continuously",
            {"warn_hours": 168},
            "Deadline extracted from the latest deferral action text in AMOS. Verify with MCC.",
        ),
        Rule(
            "PHA-01", "1.0",
            "Open predictive health case (read only)",
            "AVIATAR PHA case as reported. LineReady does not make predictions.",
        ),
        Rule(
            "READY-01", "1.0",
            "Part used in past fixes not serviceable in station stock",
            "AMOS stores inventory (SHJLINE / SHJMAIN)",
        ),
    ]
}
