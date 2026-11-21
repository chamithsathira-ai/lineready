"""Narrator + review layer (R1-R3).

R1 schema    : structured output enforced by the API and re-checked here
R2 evidence  : every sentence must cite evidence IDs that exist in this dossier
R3a policy   : deterministic guardrail linter (no sign/defer/release/diagnosis)
R3b critic   : independent Claude call checks each sentence against its evidence

Anything that fails is removed and recorded in dossier.removed_by_review.
Without an API key a deterministic template summary is used instead.
"""
from __future__ import annotations

from lineready.domain.model import Dossier
from lineready.domain.rules.policy import lint
from lineready.infrastructure.llm.claude_adapter import json_call

NARRATOR_SYSTEM = """You write the summary line of a defect dossier for a licensed A320-family line engineer.
Rules:
- Use ONLY the evidence lines provided. Every sentence must list the evidence ids it relies on.
- At most 3 sentences, at most 60 words in total. Plain, factual, engineer-to-engineer language.
- Never state a root cause or a diagnosis. You may name TSM isolation tasks and TSM-listed possible causes.
- Never say or imply that anything is signed, deferred, released, extended, cleared or airworthy.
- Lead with what needs attention tonight (deadline, repetition, readiness gap), then the best manual reference."""

NARRATOR_SCHEMA = {
    "type": "object",
    "properties": {
        "sentences": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"},
                               "evidence_ids": {"type": "array", "items": {"type": "string"}}},
                "required": ["text", "evidence_ids"], "additionalProperties": False,
            },
        }
    },
    "required": ["sentences"], "additionalProperties": False,
}

CRITIC_SYSTEM = """You are an independent verifier for aircraft maintenance briefing text.
For each numbered sentence, decide whether it is fully supported by the evidence shown under it.
Unsupported means: a number, date, part, task or claim that the evidence does not contain, or any
diagnosis, or any wording that implies signing, deferring, releasing or certifying. Be strict."""

CRITIC_SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"index": {"type": "integer"}, "supported": {"type": "boolean"},
                               "reason": {"type": "string"}},
                "required": ["index", "supported", "reason"], "additionalProperties": False,
            },
        }
    },
    "required": ["verdicts"], "additionalProperties": False,
}


def evidence_pack(d: Dossier, max_lines: int = 14) -> str:
    """Compressed context: flags + claims with their evidence ids. ~1-2k tokens, never raw documents."""
    lines = [f"DOSSIER {d.reg} · {d.title} · ATA {d.ata or '-'}"]
    for f in d.flags:
        lines.append(f"FLAG {f.rule_id} [{', '.join(f.evidence_ids)}]: {f.title}. {f.detail}")
    for c in d.all_claims()[:max_lines]:
        lines.append(f"[{', '.join(c.evidence_ids)}] ({c.kind}) {c.text[:260]}")
    return "\n".join(lines)


def template_summary(d: Dossier) -> str:
    parts = []
    if d.flags:
        parts.append(d.flags[0].title + ".")
    ref = next((c for c in d.references if c.kind == "reference"), None)
    if ref:
        parts.append(ref.text.split("→")[-1].strip())
    elif d.symptom:
        parts.append(d.symptom[0].text[:160])
    return " ".join(parts)[:320]


def narrate_and_review(d: Dossier, use_llm: bool = True) -> None:
    d.summary, d.summary_source = template_summary(d), "template"
    if not use_llm:
        return
    out = json_call(NARRATOR_SYSTEM, evidence_pack(d), NARRATOR_SCHEMA, effort="low", max_tokens=2000,
                    kind="narrator")
    if not out:
        return
    kept, removed = [], []
    for s in out.get("sentences", [])[:3]:
        text, ids = s.get("text", "").strip(), s.get("evidence_ids", [])
        if not text:
            continue
        if not ids or any(i not in d.evidence and not i.startswith("rule:") for i in ids):   # R2
            removed.append({"text": text, "gate": "R2", "reason": "missing or unknown evidence id"})
            continue
        problems = lint(text)                                                                   # R3a
        if problems:
            removed.append({"text": text, "gate": "R3-policy", "reason": "; ".join(problems)})
            continue
        kept.append({"text": text, "evidence_ids": ids})
    if kept:                                                                                    # R3b
        blocks = []
        for i, s in enumerate(kept):
            ev = "\n".join(f"  - {eid}: {d.evidence[eid].label}. {d.evidence[eid].excerpt[:300]}"
                           for eid in s["evidence_ids"] if eid in d.evidence)
            flags = "\n".join(f"  - {f.rule_id}: {f.title}. {f.detail}" for f in d.flags
                              if any(e in s["evidence_ids"] for e in f.evidence_ids))
            blocks.append(f"{i}. {s['text']}\n EVIDENCE:\n{ev}\n{flags}")
        verdict = json_call(CRITIC_SYSTEM, "\n\n".join(blocks), CRITIC_SCHEMA, effort="medium", max_tokens=3000,
                            kind="critic")
        if verdict:
            bad = {v["index"]: v["reason"] for v in verdict.get("verdicts", []) if not v.get("supported")}
            removed += [{"text": kept[i]["text"], "gate": "R3-critic", "reason": r} for i, r in bad.items()
                        if i < len(kept)]
            kept = [s for i, s in enumerate(kept) if i not in bad]
        else:
            removed += [{"text": s["text"], "gate": "R3-critic", "reason": "verifier unavailable"} for s in kept]
            kept = []
    d.removed_by_review = removed
    if kept:
        d.summary = " ".join(s["text"] for s in kept)
        d.summary_source = "llm_verified"
