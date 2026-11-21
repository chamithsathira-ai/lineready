"""HTTP API + static tablet UI."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from lineready.application.orchestrator import build_brief
from lineready.config import settings
from lineready.infrastructure.persistence import audit
from lineready.infrastructure.persistence.db import connect, query, query_one
from lineready.retrieval import search

app = FastAPI(title="LineReady", version="0.1.0")
WEB = Path(__file__).parent / "web"


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB / "index.html")


@app.get("/api/health")
def health():
    counts = query_one("""SELECT (SELECT count(*) FROM work_order) wo, (SELECT count(*) FROM fault_event) faults,
                                 (SELECT count(*) FROM manual_task) tsm_tasks, (SELECT count(*) FROM tsm_fault_index) tsm_index,
                                 (SELECT count(*) FROM pha_case) pha, (SELECT count(*) FROM stock_lot) stock""")
    doc = query_one("SELECT revision, revdate FROM manual_doc WHERE doc='TSM'")
    return {"llm_enabled": settings.llm_enabled, "model": settings.llm_model, "as_of": settings.demo_now,
            "counts": counts, "tsm": doc}


@app.get("/api/engineers")
def engineers():
    return query("""SELECT e.*, count(s.reg) aircraft FROM engineer e LEFT JOIN shift_assignment s USING (engineer_id)
                    GROUP BY e.engineer_id ORDER BY e.engineer_id""")


@app.get("/api/brief/{engineer_id}")
def get_brief(engineer_id: str, rebuild: bool = False):
    if not rebuild:
        row = query_one("""SELECT brief_id, built_at, payload FROM brief WHERE engineer_id = %s
                           ORDER BY brief_id DESC LIMIT 1""", (engineer_id,))
        if row:
            return {**row["payload"], "brief_id": row["brief_id"], "built_at": row["built_at"].isoformat()}
    try:
        return build_brief(engineer_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


NOISE = re.compile(r"\b(JOB SET-UP INFORMATION AMENDED|EFFECTIVITY UPDATED|ILLUSTRATION UPDATED|"
                   r"REFERENCE DESIGNATION)\b\s*")


def task_steps(body: str) -> list[str]:
    """Readable steps from the flat TSM text: procedure part only, split at sentence ends, de-duplicated."""
    text = NOISE.sub("", body or "")
    start = min([i for i in (text.find("Fault Confirmation"), text.find("Fault Isolation")) if i >= 0] or [0])
    seen, steps = set(), []
    for sent in re.split(r"(?<=[.:])\s+(?=[A-Z(])", text[start:]):
        sent = sent.strip()
        key = sent.lower()
        if len(sent) < 12 or key in seen:
            continue
        seen.add(key)
        steps.append(sent)
    return steps[:40]


@app.get("/api/task/{task_id}")
def manual_task(task_id: str):
    t = search.task(task_id)
    if not t:
        raise HTTPException(404, "task not found in controlled TSM")
    t.pop("tsv", None)
    t["steps"] = task_steps(t["body"])
    return t


@app.get("/api/wo/{wo_number}")
def work_order(wo_number: str):
    w = query_one("""SELECT wo_number, reg, wo_type, date_opened, date_closed, ata, description, actions, state
                     FROM work_order WHERE wo_number = %s""", (wo_number,))
    if not w:
        raise HTTPException(404, "work order not found")
    return w


class FeedbackIn(BaseModel):
    engineer_id: str
    brief_id: int
    item_id: str
    action: Literal["accept", "edit", "dismiss"]
    reason: str = Field("", max_length=500)
    edited_text: str = Field("", max_length=2000)


@app.post("/api/feedback")
def feedback(f: FeedbackIn):
    if f.action in ("edit", "dismiss") and not f.reason.strip():
        raise HTTPException(422, "A reason is required to edit or dismiss an item.")
    with connect() as conn:
        conn.execute("""INSERT INTO feedback (engineer_id, brief_id, item_id, action, reason, edited_text)
                        VALUES (%s,%s,%s,%s,%s,%s)""",
                     (f.engineer_id, f.brief_id, f.item_id, f.action, f.reason, f.edited_text))
    h = audit.record(f.engineer_id, f"review_{f.action}", f"brief:{f.brief_id}/{f.item_id}", f.model_dump())
    return {"ok": True, "audit_hash": h[:12]}


@app.get("/api/feedback/{brief_id}")
def feedback_for(brief_id: int):
    return query("""SELECT DISTINCT ON (item_id) item_id, action, reason, edited_text, ts FROM feedback
                    WHERE brief_id = %s ORDER BY item_id, ts DESC""", (brief_id,))


@app.get("/api/audit")
def audit_log(limit: int = 50):
    ok, n = audit.verify_chain()
    rows = query("SELECT id, ts, actor, kind, ref, left(hash, 12) hash FROM audit_event ORDER BY id DESC LIMIT %s",
                 (limit,))
    return {"chain_valid": ok, "events": n, "recent": rows}


# ---------------------------------------------------------------- Ask, Coach, Logbook check

class AskIn(BaseModel):
    engineer_id: str
    question: str = Field(..., min_length=3, max_length=500)
    session_id: str | None = None


@app.post("/api/ask")
def ask_endpoint(a: AskIn):
    from lineready.application.agents.ask import ask
    return ask(a.question, a.engineer_id, a.session_id)


@app.get("/api/coach/exercises/{engineer_id}")
def coach_exercises(engineer_id: str):
    from lineready.application.agents.coach import exercises
    return exercises(engineer_id)


class CoachIn(BaseModel):
    trainee: str = Field(..., max_length=60)
    engineer_id: str
    item_id: str
    tsm_task: str = Field("", max_length=300)
    history_notes: str = Field("", max_length=1000)
    parts: str = Field("", max_length=300)


@app.post("/api/coach/submit")
def coach_submit(c: CoachIn):
    from lineready.application.agents.coach import grade
    return grade(c.trainee, c.engineer_id, c.item_id, c.tsm_task, c.history_notes, c.parts)


@app.get("/api/coach/progress/{trainee}")
def coach_progress(trainee: str):
    from lineready.application.agents.coach import progress
    return progress(trainee)


class LogbookIn(BaseModel):
    engineer_id: str
    entry: str = Field(..., min_length=5, max_length=3000)
    wo_number: str | None = None
    deep: bool = False


@app.post("/api/logbook/check")
def logbook_check(l: LogbookIn):
    from lineready.application.agents.logbook import check
    return check(l.entry, l.engineer_id, l.wo_number, l.deep)
