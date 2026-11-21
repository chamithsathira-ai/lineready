"""TSM adapter: parses the Airbus SGML Trouble Shooting Manual from the data pack.

Produces two controlled-source datasets:
  * fault index rows: fault message (ECAM / CMS / observation) -> TSM task
  * task records: title, possible causes (from the TSM itself), referenced AMM tasks, body text

The SGML is parsed with targeted regular expressions: the structure we need
(FLTROW, TASK, REFEXT) is regular, and it avoids an SGML-to-XML conversion step.
"""
from __future__ import annotations

import html
import re
import tarfile
import zipfile
from datetime import date
from pathlib import Path

TSM_ZIP = "03 Technical Documentation References (AMM, IPC, TSM, MEL)/Technical References/" \
          "SGML_C_Tech_TSM_A318_A319_A320_A321_01-Nov-2026_ABY.zip"

TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")
ATTR = re.compile(r'(\w+)="([^"]*)"')
TASKREF = re.compile(r"<TASKREF>[0-9-]+<REFINT[^>]*>.*?(\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-[A-Z])</REFINT>", re.S)
FLTMSG_BLOCK = re.compile(r"<(FLTDESC2?)\b([^>]*)>(.*?)</\1>", re.S)
CMS_BLOCK = re.compile(r"<CMSDESC\b[^>]*>(.*?)</CMSDESC>", re.S)
FIRST_EFFRG = re.compile(r'<EFFECT EFFRG="([^"]*)"')


def text(s: str) -> str:
    return WS.sub(" ", html.unescape(TAG.sub(" ", s))).strip()


def norm_msg(s: str) -> str:
    return WS.sub(" ", (s or "").upper()).strip()


def load_sgml(core: Path, cache_dir: Path) -> str:
    cache = cache_dir / "TSM.SGM"
    if not cache.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        z = zipfile.ZipFile(core / TSM_ZIP)
        tar_name = next(n for n in z.namelist() if n.endswith(".tar"))
        with tarfile.open(fileobj=z.open(tar_name), mode="r|") as t:
            for m in t:
                if m.name.endswith("TSM.SGM"):
                    cache.write_bytes(t.extractfile(m).read())
                    break
    return cache.read_text(encoding="latin-1")


def doc_header(s: str) -> dict:
    head = s[: s.find(">", s.find("<TSM ")) + 1]
    a = dict(ATTR.findall(head))
    rd = a.get("REVDATE", "")
    return {"doc": "TSM", "revision": f"TSN {a.get('TSN', '?')}",
            "revdate": date(int(rd[:4]), int(rd[4:6]), int(rd[6:8])) if len(rd) == 8 else None,
            "customer": a.get("CUSNAME")}


def fault_index(s: str):
    """Yields (msg, msg_raw, kind, flt_type, ata, source, task_id, effrg)."""
    for m in re.finditer(r"<FLTROW\b[^>]*>(.*?)</FLTROW>", s, re.S):
        body = m.group(1)
        tasks = TASKREF.findall(body)
        if not tasks:
            continue
        eff = FIRST_EFFRG.search(body)
        effrg = eff.group(1) if eff else None
        msgs = []
        for _tag, attrs, inner in FLTMSG_BLOCK.findall(body):
            a = dict(ATTR.findall(attrs))
            fm = re.search(r"<FLTMSG>(.*?)</FLTMSG>", inner, re.S)
            ata = re.search(r"<ATAECAM>(.*?)</ATAECAM>", inner)
            if fm:
                msgs.append((text(fm.group(1)), a.get("CATEG", "OBSV"), a.get("FLTYPE"), ata.group(1) if ata else None, None))
        for inner in CMS_BLOCK.findall(body):
            cm = re.search(r"<CMSMSG>(.*?)</CMSMSG>", inner, re.S)
            src = re.search(r"<SOURCE>(.*?)</SOURCE>", inner, re.S)
            ata = re.search(r"<ATACMS>(.*?)</ATACMS>", inner)
            if cm:
                msgs.append((text(cm.group(1)), "CMS", "CMS FAULT", ata.group(1) if ata else None,
                             text(src.group(1)) if src else None))
        for raw, kind, ftype, ata, source in msgs:
            for task in dict.fromkeys(tasks):
                yield (norm_msg(raw), raw, kind, ftype, ata, source, task, effrg)


def tasks(s: str, revdate: date | None):
    """Yields dicts for manual_task."""
    for m in re.finditer(r"<TASK\b([^>]*)>(.*?)</TASK>", s, re.S):
        a = dict(ATTR.findall(m.group(1)))
        body = m.group(2)
        try:
            tid = f"{a['CHAPNBR']}-{a['SECTNBR']}-{a['SUBJNBR']}-{a['FUNC']}-{a['SEQ']}-{a.get('CONFLTR', 'A')}"
        except KeyError:
            continue
        title = re.search(r"<TITLE>(.*?)</TITLE>", body, re.S)
        eff = FIRST_EFFRG.search(body)
        causes = []
        pc = re.search(r"<PRETOPIC><TITLE>Possible Causes</TITLE>(.*?)</PRETOPIC>", body, re.S)
        if pc:
            for name, fin in re.findall(r"<EQUNAME>(.*?)</EQUNAME>\s*(?:<EIN[^>]*>(.*?)</EIN>)?", pc.group(1), re.S):
                causes.append({"name": text(name), "fin": text(fin) if fin else None})
        refs, seen = [], set()
        for loc, man, desig in re.findall(
                r'<REFEXT REFLOC="([0-9A-Z]+)" REFMAN="(\w+)">.*?</REFEXT>.*?</ENTRY>\s*<ENTRY[^>]*>(.*?)</ENTRY>', body, re.S):
            ref = format_ref(loc)
            if (man, ref) not in seen:
                seen.add((man, ref))
                refs.append({"man": man, "ref": ref, "title": text(desig)})
        rd = a.get("REVDATE", "")
        yield {
            "task_id": tid, "doc": "TSM", "ata4": f"{a['CHAPNBR']}-{a['SECTNBR']}",
            "title": text(title.group(1)) if title else None,
            "revdate": date(int(rd[:4]), int(rd[4:6]), int(rd[6:8])) if len(rd) == 8 else revdate,
            "effrg": eff.group(1) if eff else None, "causes": causes, "refs": refs,
            "body": text(body)[:40000],
        }


def format_ref(loc: str) -> str:
    """'324236000001' -> '32-42-36-000-001' (AMM task numbering)."""
    if len(loc) == 12 and loc.isdigit():
        return f"{loc[0:2]}-{loc[2:4]}-{loc[4:6]}-{loc[6:9]}-{loc[9:12]}"
    return loc


EFFDATA = re.compile(r"<EFFDATA>(.*?)</EFFDATA>", re.S)


def fleet(s: str):
    """Fleet allocation from the manual front matter: (reg, msn, cec, model, engine, line_nbr, operator)."""
    seen = set()
    for block in EFFDATA.findall(s[:3_000_000]):
        f = {k: text(v) for k, v in re.findall(r"<(\w+)>(.*?)</\1>", block, re.S)}
        reg = f.get("ACN")
        if reg and reg not in seen and f.get("CEC", "").isdigit():
            seen.add(reg)
            yield (reg, f.get("MSNBR"), int(f["CEC"]), f.get("MODTYPE"), f.get("ESNBR"), f.get("LINENBR"), f.get("OPERATOR"))
