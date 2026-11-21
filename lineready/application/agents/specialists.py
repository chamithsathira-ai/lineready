"""Specialist agents. Each owns one section of the dossier (the blackboard) and
writes only that section. All of them are deterministic: retrieval + rules.
The LLM is used later, only to narrate and to verify.
"""
from __future__ import annotations

from datetime import date, datetime

from lineready.domain.model import Claim, Confidence, Dossier, Evidence, Flag, Severity
from lineready.domain.rules import deadline as dl
from lineready.domain.rules.registry import RULES
from lineready.domain.rules.repetitive import rep02_logbook
from lineready.infrastructure.persistence.db import query
from lineready.retrieval import search

OUTCOME_TEXT = {"recurred": "fault seen again in AVIATAR within 10 days after closure",
                "no_recurrence_seen": "no repeat of this ATA in AVIATAR within 10 days after closure",
                "no_telemetry": "no AVIATAR data covering the period after closure",
                "unknown": "outcome unknown"}


def _wo_evidence(d: Dossier, wo: dict) -> str:
    return d.add_evidence(Evidence(
        f"wo:{wo['wo_number']}", "AMOS", f"WO {wo['wo_number']} · {wo['reg']} · {wo['wo_type']} · {wo['date_opened']}",
        excerpt=((wo.get("description") or "")[:300] + " || ACTIONS: " + (wo.get("actions") or "")[-300:]).strip()))


# ---------------------------------------------------------------- Historian

class Historian:
    """Tail history + fleet case memory, each case labelled by its telemetry outcome."""

    def run(self, d: Dossier, text: str, now: datetime) -> None:
        ata4 = (d.ata or "")[:5]
        if len(ata4) == 5:
            tail = search.tail_history(d.reg, ata4, now.date())
            for wo in tail[:4]:
                eid = _wo_evidence(d, wo)
                outcome = search.recurrence_after(d.reg, ata4, wo["date_closed"]) if wo["state"] == "Closed" else None
                state = f"closed {wo['date_closed']}" if wo["state"] == "Closed" else "still open"
                d.history.append(Claim(
                    f"Same tail, ATA {ata4}: {wo['wo_type']} {wo['wo_number']} opened {wo['date_opened']}, {state}"
                    + (f"; {OUTCOME_TEXT[outcome]}" if outcome else "") + f". {(wo['description'] or '')[:140]}",
                    [eid], "history", Confidence.HISTORY))
            pireps = [w for w in tail if w["wo_type"] == "PIREP" and w["date_opened"]]   # pilot-reported defects only
            rep = rep02_logbook([w["date_opened"] for w in pireps], now.date(), **RULES["REP-02"].params)
            if rep.hit:
                rid = d.add_evidence(Evidence("rule:REP-02", "RULE", RULES["REP-02"].title,
                                              RULES["REP-02"].source))
                d.flags.append(Flag("REP-02", Severity.WARNING, "Repetitive logbook defect",
                                    f"{rep.occurrences} pilot reports (PIREP) on ATA {ata4} in the last {rep.window} days",
                                    [rid] + [f"wo:{w['wo_number']}" for w in pireps[:rep.occurrences]
                                             if f"wo:{w['wo_number']}" in d.evidence]))
        for wo in search.similar_defects(text, d.ata, exclude_reg=d.reg):
            eid = _wo_evidence(d, wo)
            outcome = search.recurrence_after(wo["reg"], wo["ata4"], wo["date_closed"])
            d.history.append(Claim(
                f"Fleet case {wo['reg']} WO {wo['wo_number']} ({wo['date_opened']}): {(wo['description'] or '')[:110]}"
                f" → action: {(wo['actions'] or '').split('|')[-1].strip()[:140]}. Outcome: {OUTCOME_TEXT[outcome]}.",
                [eid], "history", Confidence.HISTORY))


# ---------------------------------------------------------------- Manuals

class Manuals:
    """Fault index -> TSM task -> possible causes + referenced AMM tasks (from the TSM itself)."""

    def run(self, d: Dossier, message: str | None, text: str, before: date | None = None) -> list[str]:
        """Fused retrieval: fault index + fleet case memory + guarded text search (see search.tsm_candidates)."""
        ac = search.aircraft(d.reg)
        cec = ac["cec"] if ac else None
        hits = search.tsm_candidates(message, text, d.ata, before=before, cec=cec)
        conf_for = {"exact": Confidence.EXACT, "prefix": Confidence.EXACT, "fuzzy": Confidence.VERIFIED}
        task_ids = []
        for h in hits[:3]:
            t = search.task(h["task_id"])
            if not t:
                continue
            task_ids.append(t["task_id"])
            eid = d.add_evidence(Evidence(
                f"tsm:{t['task_id']}", "TSM", f"TSM {t['task_id']} · {t['title']}",
                excerpt=(t["body"] or "")[:400], approved=True,
                revision=f"{t['revision']} · {t['revdate']}"))
            support = h.get("support") or []
            how = {"exact": f"Fault index exact match for '{h.get('msg_raw')}'",
                   "prefix": f"Fault index match for '{h.get('msg_raw')}'",
                   "fuzzy": f"Fault index close match '{h.get('msg_raw')}' (verify)",
                   "fleet_cases": f"Cited by engineers on {len(support)} similar past defect(s)",
                   "text_search": "Text search on TSM titles (verify applicability)"}[h["match"]]
            if h["match"] in ("exact", "prefix", "fuzzy") and support:
                how += f"; also cited on {len(support)} similar past defect(s)"
            conf = conf_for.get(h["match"], Confidence.VERIFIED if len(support) >= 2 else
                                Confidence.HISTORY if support else Confidence.INFO)
            ids = [eid]
            for wo in support[:3]:
                w = query("SELECT wo_number, reg, wo_type, date_opened, description, actions FROM work_order "
                          "WHERE wo_number = %s", (wo,))
                if w:
                    ids.append(_wo_evidence(d, w[0]))
            d.references.append(Claim(f"{how} → TSM {t['task_id']} \"{t['title']}\" ({t['revision']}).",
                                      ids, "reference", conf))
            causes = t["causes"] or []
            if causes:
                d.references.append(Claim(
                    f"TSM {t['task_id']} lists possible causes to isolate (not a diagnosis): "
                    + "; ".join(f"{c['name']}" + (f" ({c['fin']})" if c.get("fin") else "") for c in causes[:6]) + ".",
                    [eid], "reference", conf))
            amm = [r for r in (t["refs"] or []) if r["man"] == "AMM"][:4]
            if amm:
                d.references.append(Claim(
                    f"AMM tasks referenced by TSM {t['task_id']}: "
                    + "; ".join(f"AMM {r['ref']} {r['title']}" for r in amm) + ".", [eid], "reference", conf))
        if not task_ids:
            d.references.append(Claim(
                "No TSM fault-isolation task matched this item in the controlled TSM (TSN 86). "
                "Use the applicable AMM or CMM procedure.", [], "information_only", Confidence.INFO))
        if task_ids:
            eff = search.task(task_ids[0])["effrg"]
            if ac:
                d.references.append(Claim(
                    f"Effectivity checked for {d.reg} (MSN {ac['msn']}, CEC {ac['cec']:03d}, {ac['model']}): "
                    f"TSM {task_ids[0]} applies; tasks that exclude this aircraft were removed.",
                    [f"tsm:{task_ids[0]}"], "reference", Confidence.EXACT))
            elif eff and eff != "001999":
                d.references.append(Claim(
                    f"Effectivity is restricted ({eff[:40]}…) and {d.reg} is not in the manual's fleet table. "
                    "Confirm against the aircraft MSN before use.", [f"tsm:{task_ids[0]}"], "information_only",
                    Confidence.INFO))
        return task_ids


# ---------------------------------------------------------------- Logistics

class Logistics:
    """Parts and tools named in past fixes -> station stock and tool store."""

    STATION_STORES = ("SHJLINE", "SHJMAIN")

    def from_manuals(self, d: Dossier, max_tasks: int = 3) -> None:
        """TSM task -> referenced AMM tasks -> tools (TOOLNBR) and expendable parts (IPC CSN -> P/N) -> station stock.
        Expendables are needed only if the job is done, so a shortfall is information, not a gap for the lead."""
        ac = search.aircraft(d.reg)
        cec = ac["cec"] if ac else None
        amm_refs: list[str] = []
        for eid in [e for e in d.evidence if e.startswith("tsm:")][:2]:
            t = search.task(eid[4:])
            amm_refs += [r["ref"] for r in (t["refs"] or []) if r["man"] == "AMM" and r["ref"] not in amm_refs]
        for ref in amm_refs[:max_tasks]:
            a = search.amm_task(ref, cec)
            if not a:
                continue
            aid = d.add_evidence(Evidence(f"amm:{a['task_id']}", "AMM", f"AMM {a['task_id']} · {a['title']}",
                                          excerpt=(a["body"] or "")[:300], revision=f"TSN 86 · {a['revdate']}"))
            for tool in [t for t in (a["tools"] or []) if t.get("pn")][:2]:
                found = search.tool_for(tool["pn"])
                where = f"{len(found)} in tool store, e.g. {found[0]['store']} / {found[0]['location']}" if found \
                    else "not found in the SHJ tool stores"
                ids = [aid] + ([d.add_evidence(Evidence(f"tool:{found[0]['tool_id']}", "TOOLS",
                                                        f"Tool {found[0]['pn']} {found[0]['description']}",
                                                        f"store {found[0]['store']} location {found[0]['location']}"))]
                               if found else [])
                d.readiness.append(Claim(f"AMM {a['task_id']} needs tool {tool['pn']} ({tool['name']}): {where}.",
                                         ids, "fact", Confidence.EXACT))
            for part in (a["parts"] or [])[:3]:
                items = search.ipc_parts(part["csn"])
                if not items:
                    continue
                stocked = []
                for it in items:
                    lots = [l for l in search.stock_for(it["pn"]) if l["store"] in self.STATION_STORES
                            and (l["cond"] or "") != "US" and (l["qty"] or 0) > 0]
                    if lots:
                        stocked.append((it, lots))
                pns = ", ".join(it["pn"] + (" (alt)" if it["alternative"] else "") for it in items[:3])
                iid = d.add_evidence(Evidence(f"ipc:{part['csn']}", "IPC", f"IPC {part['csn']} · {part['name']}",
                                              excerpt=f"P/N {pns}; figure {items[0]['figure_title']}",
                                              revision="TSN 86"))
                if stocked:
                    it, lots = stocked[0]
                    sid = d.add_evidence(Evidence(f"stock:{it['pn']}", "STORES", f"Stock {it['pn']} {part['name']}",
                                                  "; ".join(f"{l['store']} {l['location']} qty {l['qty']} cond {l['cond'] or '-'}"
                                                            for l in lots[:3])))
                    q = sum(float(l["qty"]) for l in lots)
                    d.readiness.append(Claim(
                        f"AMM {a['task_id']} expendable {part['name']} (IPC {part['csn']}): P/N {it['pn']}, "
                        f"{q:g} serviceable in {lots[0]['store']}.", [aid, iid, sid], "fact", Confidence.EXACT))
                else:
                    d.readiness.append(Claim(
                        f"AMM {a['task_id']} expendable {part['name']} (IPC {part['csn']}, P/N {pns}): none serviceable "
                        f"in station stores. Needed only if the job is done.", [aid, iid], "information_only",
                        Confidence.INFO))

    def run(self, d: Dossier) -> list[str]:
        self.from_manuals(d)
        gaps = []
        pns: list[str] = []
        wo_ids = [eid[3:] for eid in d.evidence if eid.startswith("wo:")]
        if wo_ids:
            for r in query("SELECT actions FROM work_order WHERE wo_number = ANY(%s)", (wo_ids,)):
                pns += [p for p in search.part_numbers(r["actions"]) if p not in pns]
        for pn in pns[:6]:
            tools = search.tool_for(pn)
            if tools:
                t = tools[0]
                eid = d.add_evidence(Evidence(f"tool:{t['tool_id']}", "TOOLS", f"Tool {t['pn']} {t['description']}",
                                              f"store {t['store']} location {t['location']}"))
                d.readiness.append(Claim(f"Tool {t['pn']} ({t['description']}) used in past fix: "
                                         f"{len(tools)} unit(s), e.g. {t['store']} / {t['location']}.",
                                         [eid], "fact", Confidence.EXACT))
                continue
            lots = search.stock_for(pn)
            if not lots:
                continue
            serviceable = [l for l in lots if (l["cond"] or "") != "US" and (l["qty"] or 0) > 0
                           and l["store"] in self.STATION_STORES]
            eid = d.add_evidence(Evidence(f"stock:{pn}", "STORES", f"Stock {pn} {lots[0]['description']}",
                                          "; ".join(f"{l['store']} {l['location']} qty {l['qty']} cond {l['cond'] or '-'}"
                                                    for l in lots[:5])))
            if serviceable:
                q = sum(float(l["qty"]) for l in serviceable)
                d.readiness.append(Claim(f"Part {pn} ({lots[0]['description']}) used in past fix: {q:g} serviceable "
                                         f"in {serviceable[0]['store']} ({serviceable[0]['location']}).",
                                         [eid], "fact", Confidence.EXACT))
            else:
                rid = d.add_evidence(Evidence("rule:READY-01", "RULE", RULES["READY-01"].title, RULES["READY-01"].source))
                d.readiness.append(Claim(f"Part {pn} ({lots[0]['description']}) used in past fix: no serviceable unit "
                                         f"in station stores ({'; '.join(f'{l['store']} cond {l['cond'] or '-'}' for l in lots[:3])}).",
                                         [eid], "fact", Confidence.EXACT))
                d.flags.append(Flag("READY-01", Severity.WARNING, f"Part {pn} not serviceable in stock",
                                    f"{lots[0]['description']}: none serviceable in {', '.join(self.STATION_STORES)}",
                                    [eid, rid]))
                gaps.append(f"{d.reg}: part {pn} ({lots[0]['description']}) not serviceable in station stores")
        return gaps


# ---------------------------------------------------------------- Compliance

class Compliance:
    """Deferral deadlines (DEADLINE-01). Repetitive rules are applied by Triage/Historian."""

    def deadline(self, d: Dossier, wo: dict, now: datetime, departure: datetime | None) -> str | None:
        found = dl.extract_deadline(wo.get("actions") or "")
        if not found:
            return None
        status = dl.evaluate(found, now, departure, **RULES["DEADLINE-01"].params)
        eid = f"wo:{wo['wo_number']}"
        rid = d.add_evidence(Evidence("rule:DEADLINE-01", "RULE", RULES["DEADLINE-01"].title,
                                      RULES["DEADLINE-01"].source + ". " + RULES["DEADLINE-01"].note))
        words = {"expired": "has passed", "before_departure": "falls before tonight's departure",
                 "due_soon": "is within 7 days", "ok": "is not yet due"}[status]
        d.symptom.append(Claim(
            f"Deferral limit {found.deadline:%d %b %Y} ({found.method.replace('_', ' ')}) {words}. "
            f"Source text [{found.action_date:%d-%b-%Y}]: \"{found.basis[:160]}\"", [eid, rid], "fact", Confidence.EXACT))
        if status in ("expired", "before_departure", "due_soon"):
            sev = Severity.CRITICAL if status != "due_soon" else Severity.WARNING
            d.flags.append(Flag("DEADLINE-01", sev, f"Deferral limit {found.deadline:%d %b %Y} {words}",
                                "Verify the current status with MCC before departure. The agent does not defer or extend.",
                                [eid, rid]))
        return status
