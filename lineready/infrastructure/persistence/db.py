"""Postgres access: connection, schema bootstrap, bulk COPY."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Sequence

import psycopg
from psycopg.rows import dict_row

from lineready.config import settings

SCHEMA = Path(__file__).with_name("schema.sql")


@contextmanager
def connect():
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn


def init_schema() -> None:
    with connect() as conn:
        conn.execute(SCHEMA.read_text())


def copy_rows(conn, table: str, columns: Sequence[str], rows: Iterable[Sequence]) -> int:
    n = 0
    with conn.cursor().copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN") as cp:
        for r in rows:
            cp.write_row(r)
            n += 1
    return n


def query(sql: str, params: Sequence | dict | None = None) -> list[dict]:
    with connect() as conn:
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: Sequence | dict | None = None) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
