"""Guardrail linter (review gate R3, deterministic part).

The agent prepares and checks. It never signs, defers, releases or diagnoses.
Any generated sentence that reads as one of those actions is blocked.
"""
import re

FORBIDDEN = [
    (re.compile(r"\b(i|we|lineready|the agent)\s+(have\s+)?(signed|released|certified|deferred|cleared)\b", re.I),
     "agent claims to have performed a certifying action"),
    (re.compile(r"\b(aircraft|a/c)\s+(is\s+)?(released|serviceable|airworthy|cleared)\b", re.I),
     "airworthiness statement"),
    (re.compile(r"\b(you\s+(can|may|should)\s+)?(defer|release|sign off|certify)\s+(it|this|the (item|defect|aircraft))\b", re.I),
     "instruction to defer, release or certify"),
    (re.compile(r"\b(the\s+)?(root\s+)?cause\s+is\b", re.I), "diagnosis claim (show isolation paths, not causes)"),
    (re.compile(r"\bno (need|action) (to|is) (required|needed)\b", re.I), "dismisses required action"),
]


def lint(text: str) -> list[str]:
    return [reason for pat, reason in FORBIDDEN if pat.search(text or "")]
