"""AVIATAR adapter: reactive fault messages and predictive (PHA) cases. Read only."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import polars as pl


def _ts(s: str | None, fmt: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), fmt)
    except ValueError:
        return None


def faults(core: Path):
    files = sorted((core / "02 Aviatar Aircraft Health Monitoring/Reactive Monitoring").glob("*.csv"))
    df = pl.concat([pl.read_csv(f, infer_schema_length=0, encoding="utf8-lossy") for f in files], how="diagonal")
    df = df.rename({c: c.lstrip("﻿") for c in df.columns})
    df = df.unique(subset=["A/C", "Occurrence", "Message", "Flight", "Source"], keep="first")
    for r in df.iter_rows(named=True):
        ata = (r.get("Ata") or "").strip() or None
        yield (
            r["A/C"], r.get("A/C Type"), r.get("Flight"), r.get("Phase"), ata, (ata or "")[:5] or None,
            r.get("Source"), r.get("Message Type"), (r.get("Message") or "").strip(), r.get("Prio"),
            _ts(r.get("Occurrence"), "%Y-%m-%d %H:%M:%S"),
            (r.get("Repetitive") or "").lower() == "true", (r.get("Multiple") or "").lower() == "true",
        )


FAULT_COLS = ("reg", "ac_type", "flight", "phase", "ata", "ata4", "source", "msg_type", "message", "prio",
              "occurred_at", "repetitive", "multiple")


def pha_cases(core: Path):
    path = next((core / "02 Aviatar Aircraft Health Monitoring/Predictive Monitoring").glob("*.csv"))
    df = pl.read_csv(path, infer_schema_length=0, encoding="utf8-lossy")
    df = df.rename({c: c.lstrip("﻿") for c in df.columns})
    for r in df.iter_rows(named=True):
        link = r.get("Case File Link") or ""
        yield (
            link.rsplit("/", 1)[-1] or f"{r['ACREG']}-{r['Opened']}", r["ACREG"], r.get("ATA"), r.get("Max Severity"),
            r.get("Use Case"), r.get("Title"), r.get("System"), r.get("Case Type"), r.get("Classification"),
            r.get("Impact"), _ts(r.get("Opened"), "%d-%m-%Y %H:%M:%S"), _ts(r.get("Updated"), "%d-%m-%Y %H:%M:%S"),
            r.get("Status"), link,
        )


PHA_COLS = ("case_id", "reg", "ata", "severity", "use_case", "title", "system", "case_type", "classification",
            "impact", "opened", "updated", "status", "link")
