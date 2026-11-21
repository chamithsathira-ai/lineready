"""Backtest: does LineReady retrieve the TSM task engineers actually used?

Ground truth: closed PIREP/MAREP work orders whose actions cite a TSM task
("TSM 34-36-00-810-844-A"). We hide the actions, give the retriever only the
defect description, and check whether the cited task is in the top-k.

  docker compose exec app python -m evals.backtest_tsm [sample_size]
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter

from lineready.infrastructure.persistence.db import query
from lineready.retrieval import search

CITED = re.compile(r"TSM\s*(?:TASK\s*)?[:\-]?\s*(\d{2}-\d{2}-\d{2}-\d{3}-[0-9A-Z]{3})")
ISSUED_BY = re.compile(r"\s*ISSUED BY.*$", re.I)


def retrieve(desc: str, ata: str | None, before=None, exclude_wo=None, k: int = 3, reg: str | None = None
             ) -> tuple[list[str], str]:
    """Same fused retriever the Manuals agent uses. Only history before the case is visible.
    With USE_EFFECTIVITY (default on) tasks that exclude the aircraft's CEC are removed."""
    msg = ISSUED_BY.sub("", desc.split(" - ")[0]).strip()
    ac = search.aircraft(reg) if reg and os.getenv("USE_EFFECTIVITY", "1") == "1" else None
    hits = search.tsm_candidates(msg, msg, ata, before=before, exclude_wo=exclude_wo, k=k, cec=ac["cec"] if ac else None)
    return [h["task_id"] for h in hits], (hits[0]["match"] if hits else "none")


def main(n: int = 400) -> dict:
    rows = query("""SELECT wo_number, reg, ata, date_opened, description, actions FROM work_order
                    WHERE state = 'Closed' AND wo_type IN ('PIREP','MAREP') AND actions ~ 'TSM *(TASK *)?[:\\-]? *[0-9]{2}-[0-9]{2}-'
                    ORDER BY md5(wo_number) LIMIT %s""", (n,))
    stats = Counter()
    by_path = Counter()
    hit_by_path = Counter()
    for r in rows:
        cited = {c[:16] for c in CITED.findall(r["actions"] or "")}   # compare without the variant letter
        if not cited:
            continue
        stats["cases"] += 1
        got, path = retrieve(r["description"] or "", r["ata"], before=r["date_opened"], exclude_wo=r["wo_number"],
                             reg=r["reg"])
        by_path[path] += 1
        got16 = [g[:16] for g in got]
        if got16:
            stats["answered"] += 1
        if got16[:1] and got16[0] in cited:
            stats["hit@1"] += 1
        if cited & set(got16[:3]):
            stats["hit@3"] += 1
            hit_by_path[path] += 1
    c = max(stats["cases"], 1)
    report = {
        "cases": stats["cases"],
        "answered": stats["answered"],
        "coverage": round(stats["answered"] / c, 3),
        "recall@1": round(stats["hit@1"] / c, 3),
        "recall@3": round(stats["hit@3"] / c, 3),
        "precision@3_when_answered": round(stats["hit@3"] / max(stats["answered"], 1), 3),
        "by_path": {p: {"cases": by_path[p], "hit@3": hit_by_path[p]} for p in by_path},
    }
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 400)
