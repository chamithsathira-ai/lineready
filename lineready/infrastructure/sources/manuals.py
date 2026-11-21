"""AMM and IPC adapters (Airbus SGML). Extraction is cached; parsing streams task by task."""
from __future__ import annotations

import tarfile
import zipfile
from pathlib import Path

TECH = "03 Technical Documentation References (AMM, IPC, TSM, MEL)/Technical References/"
AMM_ZIP = TECH + "SGML_C_Tech_AMM_A318_A319_A320_A321_01-Nov-2026_ABY.zip"
IPC_ZIP = TECH + "SGML_C_Tech_IPC_A318_A319_A320_A321_01-Nov-2026_ABY.zip"


def extract(core: Path, cache_dir: Path, zip_rel: str, member_suffix: str, cache_name: str) -> Path:
    """Stream one SGML member out of zip -> tar into the cache (once)."""
    out = cache_dir / cache_name
    if out.exists():
        return out
    cache_dir.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(core / zip_rel)
    tar_name = next(n for n in z.namelist() if n.endswith(".tar"))
    with tarfile.open(fileobj=z.open(tar_name), mode="r|") as t:
        for m in t:
            if m.name.endswith(member_suffix):
                tmp = out.with_suffix(".part")
                with t.extractfile(m) as src, open(tmp, "wb") as dst:
                    while chunk := src.read(1 << 22):
                        dst.write(chunk)
                tmp.rename(out)
                break
    return out


# ---------------------------------------------------------------- parsing
import html as _html
import re
from datetime import date

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_ATTR = re.compile(r'(\w+)="([^"]*)"')


def _text(s: str) -> str:
    return _WS.sub(" ", _html.unescape(_TAG.sub(" ", s))).strip()


def _blocks(s: str, open_tag: str, close_tag: str):
    """Yield (attrs, body) for every <OPEN ...>...</CLOSE> block, scanning with str.find (fast on 300 MB)."""
    pos = 0
    while True:
        i = s.find(open_tag, pos)
        if i < 0:
            return
        j = s.find(">", i)
        k = s.find(close_tag, j)
        if k < 0:
            return
        yield dict(_ATTR.findall(s[i:j])), s[j + 1:k]
        pos = k + len(close_tag)


def _revdate(rd: str | None) -> date | None:
    return date(int(rd[:4]), int(rd[4:6]), int(rd[6:8])) if rd and len(rd) == 8 and rd.isdigit() else None


def _setup_section(body: str, heading: str) -> str:
    """The table that follows '<PARA>heading</PARA>' inside Job Set-up Information."""
    i = body.find(f"<PARA>{heading}")
    if i < 0:
        return ""
    j = body.find("</TABLE>", i)
    return body[i:j] if j > 0 else ""


def _rows(section: str) -> list[list[str]]:
    """Body rows of a setup table as lists of raw cell markup (header rows skipped)."""
    body = section[section.find("<TBODY>"):] if "<TBODY>" in section else section
    return [re.findall(r"<ENTRY[^>]*>(.*?)</ENTRY>", r, re.S) for r in re.findall(r"<ROW>(.*?)</ROW>", body, re.S)]


def amm_tasks(s: str):
    """AMM tasks: title, effectivity, tools, consumables, expendable parts (IPC CSN), body text."""
    for a, body in _blocks(s, "<TASK ", "</TASK>"):
        try:
            tid = f"{a['CHAPNBR']}-{a['SECTNBR']}-{a['SUBJNBR']}-{a['FUNC']}-{a['SEQ']}-{a.get('CONFLTR', 'A')}"
        except KeyError:
            continue
        title = re.search(r"<TITLE>(.*?)</TITLE>", body, re.S)
        eff = re.search(r'<EFFECT EFFRG="([^"]*)"', body)
        tools = []
        for c in _rows(_setup_section(body, "Fixtures, Tools")):
            if len(c) >= 2:   # qty column is omitted on some rows (e.g. torque wrench ranges)
                pn = re.search(r"<TOOLNBR>(.*?)</TOOLNBR>", c[0], re.S)
                tools.append({"pn": _text(pn.group(1)) if pn else None, "qty": _text(c[1]) if len(c) >= 3 else "",
                              "name": _text(c[-1])})
        cons = [{"ref": _text(c[0]), "name": _text(c[1])} for c in _rows(_setup_section(body, "Consumable Materials"))
                if len(c) >= 2 and "<CONNBR>" in c[0]]
        parts = []
        for c in _rows(_setup_section(body, "Expendable Parts")):
            csn = re.search(r"<CSN>(.*?)</CSN>", c[-1], re.S) if c else None
            if csn and len(c) >= 3:
                parts.append({"fig_item": _text(c[0]), "name": _text(c[1]), "csn": _text(csn.group(1))})
        yield {"task_id": tid, "title": _text(title.group(1)) if title else None,
               "revdate": _revdate(a.get("REVDATE")), "effrg": eff.group(1) if eff else None,
               "tools": tools[:30], "consumables": cons[:30], "parts": parts[:40], "body": _text(body)[:40000]}


def ipc_items(s: str):
    """IPC items: (csn, key, pn, mfr, upa, alternative, effrg, figure_title)."""
    for fa, fbody in _blocks(s, "<FIGURE ", "</FIGURE>"):
        ftitle = re.search(r"<TITLE>(.*?)</TITLE>", fbody, re.S)
        ftitle = _text(ftitle.group(1)) if ftitle else None
        for ia, ibody in _blocks(fbody, "<ITEM ", "</ITEM>"):
            pn = re.search(r"<PNR[^>]*>(.*?)</PNR>", ibody, re.S)
            if not pn:
                continue
            fig = re.match(r"(\d+)", ia.get("FIGNBR", "")) or None
            csn = f"{ia.get('CHAPNBR', '')}{ia.get('SECTNBR', '')}{ia.get('UNITNBR', '')}{fig.group(1).zfill(2) if fig else '00'}" \
                  f"-{ia.get('ITEMNBR', '')}"
            mfr = re.search(r"<MFR>(.*?)</MFR>", ibody, re.S)
            upa = re.search(r"<UPA>(.*?)</UPA>", ibody, re.S)
            eff = re.search(r'<EFFECT EFFRG="([^"]*)"', ibody)
            yield (csn, ia.get("KEY"), _text(pn.group(1)), _text(mfr.group(1)) if mfr else None,
                   _text(upa.group(1)) if upa else None, "ALTERNATIVE" in ibody, eff.group(1) if eff else None, ftitle)
