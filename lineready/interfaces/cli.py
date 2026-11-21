"""LineReady command line.

  python -m lineready.interfaces.cli init          create schema
  python -m lineready.interfaces.cli ingest        load the data pack (all sources)
  python -m lineready.interfaces.cli ingest tsm    load one source
  python -m lineready.interfaces.cli seed-shift    create the synthetic SHJ night shift
  python -m lineready.interfaces.cli brief E1      build and print one engineer's brief
"""
from __future__ import annotations

import json
import sys
import time

from psycopg.types.json import Jsonb

from lineready.config import settings
from lineready.infrastructure.persistence import db
from lineready.infrastructure.sources import amos, aviatar, tsm


def _timed(label):
    def deco(fn):
        def run(*a, **kw):
            t = time.time()
            n = fn(*a, **kw)
            print(f"  {label:<22} {n:>9,} rows  {time.time() - t:6.1f}s", flush=True)
            return n
        return run
    return deco


@_timed("work orders")
def load_work_orders(conn):
    conn.execute("TRUNCATE work_order")
    return db.copy_rows(conn, "work_order", amos.WO_COLS, amos.work_orders(settings.data_core))


@_timed("stock lots")
def load_stock(conn):
    conn.execute("TRUNCATE stock_lot")
    return db.copy_rows(conn, "stock_lot", amos.STOCK_COLS, amos.stock(settings.data_core))


@_timed("tools")
def load_tools(conn):
    conn.execute("TRUNCATE tool")
    return db.copy_rows(conn, "tool", amos.TOOL_COLS, amos.tools(settings.data_core))


@_timed("AVIATAR fault events")
def load_faults(conn):
    conn.execute("TRUNCATE fault_event")
    return db.copy_rows(conn, "fault_event", aviatar.FAULT_COLS, aviatar.faults(settings.data_core))


@_timed("PHA cases")
def load_pha(conn):
    conn.execute("TRUNCATE pha_case")
    return db.copy_rows(conn, "pha_case", aviatar.PHA_COLS, aviatar.pha_cases(settings.data_core))


@_timed("TSM index + tasks")
def load_tsm(conn):
    s = tsm.load_sgml(settings.data_core, settings.cache_dir)
    head = tsm.doc_header(s)
    conn.execute("DELETE FROM manual_doc WHERE doc='TSM'")
    conn.execute("INSERT INTO manual_doc VALUES (%s,%s,%s,%s,%s)",
                 ("TSM", head["revision"], head["revdate"], head["customer"], tsm.TSM_ZIP.rsplit("/", 1)[-1]))
    conn.execute("TRUNCATE tsm_fault_index")
    n = db.copy_rows(conn, "tsm_fault_index",
                     ("msg", "msg_raw", "kind", "flt_type", "ata", "source", "task_id", "effrg"), tsm.fault_index(s))
    conn.execute("DELETE FROM manual_task WHERE doc='TSM'")
    seen: set[str] = set()

    def unique_tasks():
        for t in tsm.tasks(s, head["revdate"]):
            if t["task_id"] in seen:   # same task repeated for another effectivity block: keep the first
                continue
            seen.add(t["task_id"])
            yield (t["task_id"], t["doc"], t["ata4"], t["title"], t["revdate"], t["effrg"], Jsonb(t["causes"]),
                   Jsonb(t["refs"]), t["body"])
    rows = unique_tasks()
    m = db.copy_rows(conn, "manual_task",
                     ("task_id", "doc", "ata4", "title", "revdate", "effrg", "causes", "refs", "body"), rows)
    print(f"  {'(TSM tasks)':<22} {m:>9,} rows  revision {head['revision']} {head['revdate']}")
    return n


@_timed("case memory")
def load_cases(conn):
    """Derived store: closed defects whose actions cite a TSM task (the fleet's troubleshooting memory)."""
    from lineready.retrieval.search import CITED_TSM
    conn.execute("TRUNCATE case_memory")
    rows = conn.execute("""SELECT wo_number, reg, ata4, date_opened, description, actions FROM work_order
                           WHERE state = 'Closed' AND wo_type IN ('PIREP','MAREP') AND actions LIKE '%TSM%'""").fetchall()

    def gen():
        for r in rows:
            tasks = sorted({c[:16] for c in CITED_TSM.findall(r["actions"] or "")})
            if tasks:
                yield (r["wo_number"], r["reg"], r["ata4"], (r["ata4"] or "")[:2], r["date_opened"],
                       r["description"], tasks)
    return db.copy_rows(conn, "case_memory", ("wo_number", "reg", "ata4", "chap", "date_opened", "description",
                                              "tasks"), gen())


LOADERS = {"wo": load_work_orders, "stock": load_stock, "tools": load_tools, "faults": load_faults,
           "pha": load_pha, "tsm": load_tsm, "cases": load_cases}


def ingest(only: list[str]):
    db.init_schema()
    for key in only or LOADERS:
        with db.connect() as conn:
            LOADERS[key](conn)
    with db.connect() as conn:
        conn.execute("ANALYZE")


def main(argv: list[str]):
    if not argv:
        print(__doc__)
        return
    cmd, rest = argv[0], argv[1:]
    if cmd == "init":
        db.init_schema()
        print("schema ready")
    elif cmd == "ingest":
        ingest(rest)
    elif cmd == "seed-shift":
        from lineready.application.seed_shift import seed
        seed()
    elif cmd == "brief":
        from lineready.application.orchestrator import build_brief
        brief = build_brief(rest[0])
        out = settings.cache_dir / f"brief_{rest[0]}.json"
        out.write_text(json.dumps(brief, indent=2, default=str))
        print(f"brief {brief['brief_id']} written to {out}  stats={brief['stats']}")
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
