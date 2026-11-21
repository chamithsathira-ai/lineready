"""AMOS adapter: work orders, stores inventory, tool inventory (XLSX exports).

Later this adapter can be swapped for a live AMOS API without touching the domain.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import polars as pl

EXCEL_EPOCH = date(1899, 12, 30)


def _str(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _date(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    try:
        return EXCEL_EPOCH + timedelta(days=int(float(s)))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _read(path: Path) -> pl.DataFrame:
    return pl.read_excel(path, engine="calamine", infer_schema_length=0)  # all columns as text


def work_orders(core: Path):
    df = _read(core / "01 AMOS/01 Technical History/Maintenance History.xlsx")
    for r in df.iter_rows(named=True):
        ata = _str(r.get("ata"))
        yield (
            _str(r["wo_number"]), _str(r["aircraft_reg"]), _str(r.get("operator_code")), _str(r.get("wo_type")),
            _date(r.get("date_opened")), _date(r.get("date_closed")), ata, (ata or "")[:5] or None,
            _str(r.get("wo_description")), _str(r.get("wo_actions")), _str(r.get("wo_state")),
        )


WO_COLS = ("wo_number", "reg", "operator", "wo_type", "date_opened", "date_closed", "ata", "ata4",
           "description", "actions", "state")


def stock(core: Path):
    df = _read(core / "01 AMOS/02 Spares Inventory List/Inventory List.xlsx")
    for r in df.iter_rows(named=True):
        yield (_str(r.get("Store")), _str(r.get("Location")), _str(r.get("Part No.:")), _str(r.get("Serial/Batch No.")),
               _str(r.get("Description")), _str(r.get("Mat. Class")), _num(r.get("Qty")), _str(r.get("Cond.")),
               _str(r.get("Order No.")))


STOCK_COLS = ("store", "location", "pn", "serial", "description", "mat_class", "qty", "cond", "order_no")


def tools(core: Path):
    for name in ("Tools SHJLINE.xlsx", "Tools SHJMAIN.xlsx"):
        df = _read(core / "01 AMOS/03 Tool Inventory List" / name)
        for r in df.iter_rows(named=True):
            yield (_str(r.get("Part Number")), _str(r.get("SN/BN")), _str(r.get("Description")), _str(r.get("ID")),
                   _str(r.get("Station")), _str(r.get("Store")), _str(r.get("Location")), _date(r.get("Expires")),
                   _num(r.get("Qty")))


TOOL_COLS = ("pn", "sn", "description", "tool_id", "station", "store", "location", "expires", "qty")
