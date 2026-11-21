"""Domain model. Pure data: no I/O, no framework imports.

The core contract: every Claim and Flag points at Evidence. Nothing reaches the
engineer without a resolvable source.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum


class Confidence(str, Enum):
    EXACT = "exact_match"          # deterministic key lookup (fault index, WO number)
    VERIFIED = "retrieved_verified"  # retrieved + passed the verifier
    HISTORY = "fleet_history"      # similar past cases: information only
    INFO = "information_only"      # not from a controlled source


class Severity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


@dataclass
class Evidence:
    evidence_id: str               # e.g. 'wo:6185232', 'tsm:32-42-00-810-923-A'
    source: str                    # AMOS | AVIATAR | PHA | TSM | AMM | STORES | TOOLS | RULE | SYNTHETIC
    label: str                     # short human label
    excerpt: str = ""
    approved: bool = True          # controlled source?
    revision: str | None = None
    url: str | None = None


@dataclass
class Flag:
    rule_id: str
    severity: Severity
    title: str
    detail: str
    evidence_ids: list[str]


@dataclass
class Claim:
    text: str
    evidence_ids: list[str]
    kind: str = "fact"             # fact | reference | history | information_only
    confidence: Confidence = Confidence.VERIFIED


@dataclass
class Dossier:
    item_id: str
    reg: str
    kind: str                      # episode | pha | deferral | defect
    title: str
    ata: str | None
    score: int = 0
    symptom: list[Claim] = field(default_factory=list)
    history: list[Claim] = field(default_factory=list)
    references: list[Claim] = field(default_factory=list)
    readiness: list[Claim] = field(default_factory=list)
    flags: list[Flag] = field(default_factory=list)
    summary: str = ""
    summary_source: str = "template"   # template | llm
    removed_by_review: list[dict] = field(default_factory=list)
    evidence: dict[str, Evidence] = field(default_factory=dict)

    def add_evidence(self, ev: Evidence) -> str:
        self.evidence[ev.evidence_id] = ev
        return ev.evidence_id

    def all_claims(self) -> list[Claim]:
        return self.symptom + self.history + self.references + self.readiness


@dataclass
class AircraftSlot:
    reg: str
    arrival: datetime | None
    departure: datetime | None
    stand: str | None
    flight_out: str | None


@dataclass
class Brief:
    engineer_id: str
    engineer_name: str
    as_of: datetime
    shift_label: str
    aircraft: list[AircraftSlot]
    pinned: Dossier | None
    dossiers: list[Dossier]
    handover: list[dict]
    notify_lead: list[str]
    stats: dict


def to_dict(obj) -> dict:
    """Serialise dataclasses (incl. enums/datetimes) to JSON-safe dicts."""
    def conv(v):
        if isinstance(v, Enum):
            return v.value
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        if isinstance(v, list):
            return [conv(x) for x in v]
        return v
    return conv(asdict(obj))
