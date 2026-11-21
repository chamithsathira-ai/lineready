"""LineReady command line.

  python -m lineready.interfaces.cli init          create schema
  python -m lineready.interfaces.cli ingest        load the data pack (all sources)
  python -m lineready.interfaces.cli ingest tsm    load one source
  python -m lineready.interfaces.cli seed-shift    create the synthetic SHJ night shift
  python -m lineready.interfaces.cli brief E1      build and print one engineer's brief
"""
from __future__ import annotations

import json
import re
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


@_timed("fleet allocation")
def load_fleet(conn):
    """Tail -> MSN -> CEC from the TSM front matter (uses the cached SGML, a few seconds)."""
    s = tsm.load_sgml(settings.data_core, settings.cache_dir)
    conn.execute("TRUNCATE aircraft")
    return db.copy_rows(conn, "aircraft", ("reg", "msn", "cec", "model", "engine", "line_nbr", "operator"), tsm.fleet(s))


@_timed("AMM tasks")
def load_amm(conn):
    from lineready.infrastructure.sources import manuals
    path = manuals.extract(settings.data_core, settings.cache_dir, manuals.AMM_ZIP, "AMM.SGM", "AMM.SGM")
    s = path.read_text(encoding="latin-1")
    rd = re.search(r'<AMM\b[^>]*REVDATE="(\d{8})"[^>]*TSN="(\d+)"', s[:5000]) or \
        re.search(r'<AMM\b[^>]*TSN="(\d+)"[^>]*REVDATE="(\d{8})"', s[:5000])
    conn.execute("DELETE FROM manual_doc WHERE doc='AMM'")
    conn.execute("INSERT INTO manual_doc VALUES ('AMM', %s, %s, 'AIR ARABIA', %s)",
                 (f"TSN {re.search(r'TSN=.(\d+)', s[:5000]).group(1)}" if 'TSN=' in s[:5000] else None,
                  manuals._revdate(re.search(r'REVDATE=.(\d{8})', s[:5000]).group(1)), manuals.AMM_ZIP.rsplit("/", 1)[-1]))
    conn.execute("TRUNCATE amm_task")
    seen: set[str] = set()

    def rows():
        for t in manuals.amm_tasks(s):
            if t["task_id"] in seen:
                continue
            seen.add(t["task_id"])
            yield (t["task_id"], t["title"], t["revdate"], t["effrg"], Jsonb(t["tools"]), Jsonb(t["consumables"]),
                   Jsonb(t["parts"]), t["body"])
    return db.copy_rows(conn, "amm_task", ("task_id", "title", "revdate", "effrg", "tools", "consumables", "parts",
                                           "body"), rows())


@_timed("IPC items")
def load_ipc(conn):
    from lineready.infrastructure.sources import manuals
    path = manuals.extract(settings.data_core, settings.cache_dir, manuals.IPC_ZIP, "AIPC.SGM", "AIPC.SGM")
    s = path.read_text(encoding="latin-1")
    conn.execute("DELETE FROM manual_doc WHERE doc='IPC'")
    conn.execute("INSERT INTO manual_doc VALUES ('IPC', %s, %s, 'AIR ARABIA', %s)",
                 (f"TSN {re.search(r'TSN=.(\d+)', s[:5000]).group(1)}" if 'TSN=' in s[:5000] else None,
                  manuals._revdate(re.search(r'REVDATE=.(\d{8})', s[:5000]).group(1)), manuals.IPC_ZIP.rsplit("/", 1)[-1]))
    conn.execute("TRUNCATE ipc_item")
    return db.copy_rows(conn, "ipc_item", ("csn", "key", "pn", "mfr", "upa", "alternative", "effrg", "figure_title"),
                        manuals.ipc_items(s))


@_timed("embeddings")
def load_embeddings(conn):
    """Embed defect descriptions (closed PIREP/MAREP, the case memory) and manual task titles."""
    from lineready.infrastructure.embed import embed, vec_literal
    from lineready.retrieval.search import clean
    n = 0
    jobs = [
        ("wo_embedding", "wo_number", conn.execute(
            """SELECT wo_number k, description t, left(ata4, 2) chap FROM work_order WHERE wo_type IN ('PIREP','MAREP')
               AND state = 'Closed' AND description IS NOT NULL""").fetchall(), None),
        ("task_embedding", "task_id", conn.execute("SELECT task_id k, title t FROM manual_task").fetchall(), "TSM"),
        ("task_embedding", "task_id", conn.execute("SELECT task_id k, title t FROM amm_task").fetchall(), "AMM"),
    ]
    conn.execute("TRUNCATE wo_embedding, task_embedding")
    for table, key, rows, doc in jobs:
        cache: dict[str, str] = {}   # identical cleaned texts are embedded once (54k unique of 82k defects)
        for i in range(0, len(rows), 2048):
            batch = rows[i:i + 2048]
            texts = [clean(r["t"] or "")[:256] or "-" for r in batch]
            new = list(dict.fromkeys(t for t in texts if t not in cache))
            for t, v in zip(new, embed(new)):
                cache[t] = v
            vecs = [cache[t] for t in texts]
            cols = (key, "chap", "emb") if doc is None else (key, "doc", "emb")
            data = ((r["k"], r["chap"], vec_literal(v)) if doc is None else (r["k"], doc, vec_literal(v))
                    for r, v in zip(batch, vecs))
            with conn.cursor().copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as cp:
                for row in data:
                    cp.write_row(row)
            conn.commit()   # commit per batch: readers are never blocked behind one long transaction
            n += len(batch)
            print(f"    {table}: {i + len(batch):,}/{len(rows):,}", flush=True)
    return n


@_timed("query embeddings")
def load_query_embeddings(conn):
    """Precompute embeddings for every text the brief, packs and handover search with, so the server needs
    no model: distinct AVIATAR messages, open defect descriptions, PHA case titles. Unknown texts at runtime
    (free-text Ask questions) fall back to keyword + fleet search."""
    from lineready.infrastructure.embed import embed, vec_literal
    from lineready.retrieval.search import clean, qkey
    texts = [r["t"] for r in conn.execute("SELECT DISTINCT message t FROM fault_event WHERE message <> ''").fetchall()]
    texts += [r["t"] for r in conn.execute(
        "SELECT description t FROM work_order WHERE state = 'Open' AND wo_type IN ('PIREP','MAREP')").fetchall()]
    texts += [f"{r['title']} {r['use_case']}" for r in conn.execute("SELECT title, use_case FROM pha_case").fetchall()]
    canon = {}
    for t in texts:
        for variant in {t, clean(t)}:
            c, key = qkey(variant or "")
            if c.strip():
                canon[key] = c
    conn.execute("TRUNCATE query_embedding")
    keys = list(canon)
    for i in range(0, len(keys), 2048):
        batch = keys[i:i + 2048]
        vecs = embed([canon[k] for k in batch])
        with conn.cursor().copy("COPY query_embedding (key, emb) FROM STDIN") as cp:
            for k, v in zip(batch, vecs):
                cp.write_row((k, vec_literal(v)))
        conn.commit()
    return len(keys)


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
           "pha": load_pha, "tsm": load_tsm, "fleet": load_fleet, "amm": load_amm, "ipc": load_ipc,
           "cases": load_cases, "embed": load_embeddings, "qembed": load_query_embeddings}


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
