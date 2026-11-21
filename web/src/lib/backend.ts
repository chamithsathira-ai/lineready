// Adapter: FastAPI payloads -> UI types. Server-side only (called from server components).
// The UI contracts in types.ts stay the source of truth; this file is the only place that
// knows the backend's shape.
import "server-only";
import { cache } from "react";
import type {
  AircraftOnShift, BriefCategory, BriefItem, Dossier, Engineer, EvidenceRef, HistoryRow, ManualTask, PartRow,
  ReadinessGap, ReadinessRow, ReferenceRow, ShiftBrief, SourceRecord, Status, TimelineEvent,
} from "@/lib/types";
import { manualSlug } from "@/lib/manuals";

export const API_URL = process.env.LINEREADY_API_URL;

// ---------- backend shapes (only the fields we use) ----------
interface BClaim { text: string; evidence_ids: string[]; kind: string; confidence: string }
interface BFlag { rule_id: string; severity: "critical" | "warning" | "info"; title: string; detail: string; evidence_ids: string[] }
interface BEvidence { evidence_id: string; source: string; label: string; excerpt: string; approved: boolean; revision: string | null; url: string | null }
export interface BDossier {
  item_id: string; reg: string; kind: string; title: string; ata: string | null; score: number;
  symptom: BClaim[]; history: BClaim[]; references: BClaim[]; readiness: BClaim[]; flags: BFlag[];
  summary: string; summary_source: string; removed_by_review: { text: string; gate: string; reason: string }[];
  evidence: Record<string, BEvidence>;
}
export interface BBrief {
  brief_id: number; engineer_id: string; engineer_name: string; as_of: string; built_at?: string; shift_label: string;
  aircraft: { reg: string; arrival: string | null; departure: string | null; stand: string | null; flight_out: string | null }[];
  pinned: BDossier | null; dossiers: BDossier[];
  handover: { reg: string; written_at: string; author: string; note: string }[];
  notify_lead: string[]; aircraft_types?: Record<string, string>; synthetic_notice?: string;
  stats: Record<string, number | boolean>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** One backend fetch per request, shared by every component that needs the brief. */
export const fetchBrief = cache((engineerId: string) => get<BBrief>(`/brief/${encodeURIComponent(engineerId)}`));

// ---------- helpers ----------
/** Item ids contain ':' (wo:123, ep:A6-AQP:ab12). Slugs keep URLs clean and are matched back to items. */
export const slug = (itemId: string) => itemId.replace(/:/g, "_");
const hhmm = (iso: string | null | undefined) => (iso ? iso.slice(11, 16) : "");
const clean = (t: string) => t.replace(/^\s*ENG(?:INEERING)?\s+ENTRY\s*:\s*/i, "").replace(/\s+ISSUED BY\s*:.*$/i, "").trim();

function shiftStart(asOf: string): Date {
  const d = new Date(asOf);
  const start = new Date(d);
  start.setHours(22, 0, 0, 0);
  if (d.getHours() < 12) start.setDate(start.getDate() - 1); // brief built after midnight belongs to last night's shift
  return start;
}
const minutesFrom = (start: Date, iso: string | null) => (iso ? Math.round((new Date(iso).getTime() - start.getTime()) / 60000) : 0);

const KIND_OF: Record<string, EvidenceRef["kind"]> = {
  wo: "wo", tsm: "manual", amm: "manual", pha: "pha", rule: "rule", stock: "stores", tool: "tool", ep: "aviatar", aviatar: "aviatar",
};

export function evRef(id: string): EvidenceRef {
  const [p, ...rest] = id.split(":");
  const tail = rest.join(":");
  const label: Record<string, string> = {
    wo: `WO ${tail}`, tsm: `TSM ${tail}`, pha: `PHA ${tail}`, rule: `Rule ${tail}`, stock: `Stores ${tail}`,
    tool: `Tool ${tail}`, ep: `AVIATAR episode ${rest[1] ?? ""}`.trim(), aviatar: `AVIATAR ${rest.slice(1).join(":")}`,
  };
  return { id: label[p] ?? id, ref: id, kind: KIND_OF[p] ?? "other" };
}

function uniqueRefs(ids: string[], max = 6): EvidenceRef[] {
  return [...new Set(ids)].slice(0, max).map(evRef);
}

function category(d: BDossier): BriefCategory {
  const rules = d.flags.map((f) => f.rule_id);
  if (rules.includes("DEADLINE-01")) return "deadline";
  if (rules.some((r) => r.startsWith("REP-"))) return "repetitive";
  if (d.kind === "predictive_case") return "predictive";
  if (d.kind === "open_defect") return "techlog";
  return "fault";
}

function status(d: BDossier): Status {
  if (d.flags.some((f) => f.severity === "critical")) return "act";
  if (d.kind === "predictive_case") return "info";
  if (d.flags.some((f) => f.severity === "warning")) return "prep";
  return "info";
}

const RANK: Record<Status, number> = { act: 4, prep: 3, info: 2, train: 1, ok: 0 };

function toItem(d: BDossier, pinnedId: string | undefined): BriefItem {
  const deadline = d.flags.find((f) => f.rule_id === "DEADLINE-01");
  const source = d.kind === "aviatar_episode" ? "AVIATAR" : d.kind === "predictive_case" ? "PHA" : "AMOS";
  return {
    id: d.item_id,
    tail: d.reg,
    category: category(d),
    status: status(d),
    source,
    title: deadline ? `${deadline.title}: ${clean(d.title)}` : clean(d.title),
    detail: d.summary,
    evidence: uniqueRefs([...d.flags.flatMap((f) => f.evidence_ids), ...d.symptom.flatMap((c) => c.evidence_ids),
      ...d.references.flatMap((c) => c.evidence_ids)]),
    pinned: d.item_id === pinnedId,
    dossierId: slug(d.item_id),
  };
}

// ---------- brief ----------
export function toShiftBrief(b: BBrief): ShiftBrief {
  const start = shiftStart(b.as_of);
  const items = b.dossiers.map((d) => toItem(d, b.pinned?.item_id));
  const aircraft: AircraftOnShift[] = b.aircraft.map((a) => {
    const worst = items.filter((i) => i.tail === a.reg).reduce<Status>((w, i) => (RANK[i.status] > RANK[w] ? i.status : w), "ok");
    return {
      tail: a.reg, type: b.aircraft_types?.[a.reg] ?? "A320", stand: (a.stand ?? "–").replace(/^S/, ""),
      departure: a.departure ? hhmm(a.departure) : null,
      arriveMin: Math.max(0, minutesFrom(start, a.arrival)), departMin: a.departure ? minutesFrom(start, a.departure) : 480,
      status: worst,
    };
  });
  const gaps: ReadinessGap[] = b.dossiers.flatMap((d) => d.flags.filter((f) => f.rule_id === "READY-01").map((f, n) => ({
    id: `${d.item_id}-${n}`, tail: d.reg, title: f.title, detail: f.detail, state: "sent" as const, evidence: uniqueRefs(f.evidence_ids),
  })));
  const asOf = new Date(b.as_of);
  return {
    station: "SHJ Line",
    shiftLabel: `Night shift · ${asOf.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`,
    window: "22:00 to 06:00",
    shiftStartHour: 22,
    shiftMinutes: 480,
    nowMin: Math.max(0, minutesFrom(start, b.as_of)),
    engineer: b.engineer_name,
    version: `#${b.brief_id}`,
    builtAt: hhmm(b.as_of),
    verified: true,
    items,
    aircraft,
    readinessGaps: gaps,
    readinessSentAt: hhmm(b.as_of),
    handover: {
      from: b.handover[0]?.author ?? "Day shift",
      at: hhmm(b.handover[0]?.written_at),
      text: b.handover.length
        ? b.handover.map((h) => `${h.reg}: ${h.note.replace(/^\[SYNTHETIC[^\]]*\]\s*/, "")}`).join(" · ")
        : "No handover notes for these aircraft.",
    },
    briefId: b.brief_id,
    engineerId: b.engineer_id,
    live: true,
    notice: b.synthetic_notice,
  };
}

// ---------- dossier ----------
const OUTCOME: [RegExp, string, boolean][] = [
  [/fault seen again/i, "Came back within 10 days", true],
  [/no repeat/i, "No repeat within 10 days", false],
  [/no AVIATAR data/i, "No telemetry after the fix", false],
  [/still open/i, "Still open", false],
];

export function toDossier(d: BDossier, briefId: number): Dossier {
  const firstTsm = Object.keys(d.evidence).find((k) => k.startsWith("tsm:"));
  const timeline: TimelineEvent[] = [
    ...d.flags.map((f) => ({ when: `Rule ${f.rule_id}`, text: `${f.title}. ${f.detail}`, hot: f.severity !== "info" })),
    ...d.symptom.map((c) => ({ when: d.evidence[c.evidence_ids[0]]?.source ?? "Record", text: c.text })),
  ];
  const history: HistoryRow[] = d.history.map((c) => {
    const ev = d.evidence[c.evidence_ids[0]];
    const parts = (ev?.label ?? "").split(" · ");
    const actions = (ev?.excerpt ?? "").split(" || ACTIONS: ")[1] ?? "";
    const last = actions.split("|").pop()?.replace(/\[\d{2}-\w{3}-\d{4}\]\s*/, "").trim() ?? "";
    const out = OUTCOME.find(([re]) => re.test(c.text));
    return {
      date: parts[3] ?? "", tail: parts[1] ?? d.reg,
      action: last ? last.slice(0, 160) : clean(c.text).slice(0, 160),
      outcome: out?.[1] ?? "Information only", recurred: out?.[2] ?? false,
    };
  });
  const references: ReferenceRow[] = [];
  const seen = new Set<string>();
  for (const c of d.references) {
    const tsmId = c.evidence_ids.find((e) => e.startsWith("tsm:"));
    if (tsmId && c.text.includes("→") && !seen.has(tsmId)) {
      seen.add(tsmId);
      const how = c.text.split("→")[0].trim();
      const title = (d.evidence[tsmId]?.label ?? "").split(" · ")[1] ?? "";
      references.push({ id: `TSM ${tsmId.slice(4)}`, title: `${title} · ${how}`, exact: c.confidence === "exact_match" });
    }
    for (const m of c.text.matchAll(/AMM (\d{2}-\d{2}-\d{2}-\d{3}-\d{3}) ([^;.]+)/g)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        references.push({ id: `AMM ${m[1]}`, title: `${m[2].trim()} · referenced by the TSM task`, exact: true });
      }
    }
  }
  const parts: PartRow[] = d.readiness.map((c) => {
    const id = c.evidence_ids.find((e) => e.startsWith("stock:") || e.startsWith("tool:")) ?? c.evidence_ids[0];
    const ev = d.evidence[id];
    const isTool = id?.startsWith("tool:");
    const missing = /no serviceable/i.test(c.text);
    const pn = id?.split(":")[1] ?? "";
    return {
      item: (ev?.label ?? "").replace(/^(Stock|Tool)\s+\S+\s*/, "") || (isTool ? "Tool" : "Part"),
      ref: pn, stock: (ev?.excerpt ?? "").slice(0, 90),
      status: missing ? "act" : "ok", statusLabel: missing ? "Not serviceable" : isTool ? "Available" : "Ready",
    };
  });
  const noTask = d.references.some((c) => c.text.startsWith("No TSM fault-isolation task"));
  const deadline = d.flags.find((f) => f.rule_id === "DEADLINE-01");
  const firstRef = references.find((r) => r.id.startsWith("TSM"));
  const nextStep = deadline
    ? "Verify the current status of this deferral with MCC before departure. LineReady does not defer or extend."
    : firstRef
      ? `Start from ${firstRef.id} (${firstRef.title.split(" · ")[0]}). ${firstRef.exact ? "" : "Confirm it applies before use. "}Check effectivity for this MSN.`
      : noTask
        ? "No TSM fault-isolation task matched. Use the applicable AMM or CMM procedure."
        : "Review the history and the sources, then decide the troubleshooting path.";
  const tsmEv = firstTsm ? d.evidence[firstTsm] : undefined;
  return {
    id: slug(d.item_id),
    itemId: d.item_id,
    version: `brief #${briefId}`,
    summary: d.summary,
    timeline,
    nextStep,
    manualTaskId: firstTsm ? manualSlug(`TSM ${firstTsm.slice(4)}`) : undefined,
    history,
    references,
    revision: tsmEv?.revision ? `TSM ${tsmEv.revision}` : undefined,
    parts,
    summarySource: d.summary_source,
    removed: d.removed_by_review,
  };
}

// ---------- readiness board ----------
export function toReadiness(b: BBrief, brief: ShiftBrief): ReadinessRow[] {
  return brief.aircraft.map((a) => {
    const ds = b.dossiers.filter((d) => d.reg === a.tail);
    const claims = ds.flatMap((d) => d.readiness);
    const partGap = ds.some((d) => d.flags.some((f) => f.rule_id === "READY-01"));
    const hasParts = claims.some((c) => c.evidence_ids.some((e) => e.startsWith("stock:")));
    const hasTools = claims.some((c) => c.evidence_ids.some((e) => e.startsWith("tool:")));
    const exact = ds.some((d) => d.references.some((c) => c.confidence === "exact_match" && c.text.includes("→")));
    const anyRef = ds.some((d) => d.references.some((c) => c.text.includes("→")));
    const n = brief.items.filter((i) => i.tail === a.tail).length;
    return {
      tail: a.tail,
      departure: a.departure ?? "Night stop",
      parts: partGap ? "act" : hasParts ? "ok" : "info",
      tools: hasTools ? "ok" : "info",
      manuals: exact ? "ok" : anyRef ? "info" : "info",
      note: `${n} ${n === 1 ? "item" : "items"}${partGap ? " · part not serviceable in stock" : ""}${!hasParts && !partGap ? " · no parts identified from past fixes" : ""}`,
    };
  });
}

// ---------- manuals ----------
export async function fetchManualTask(taskId: string, fromDossier?: string): Promise<ManualTask | undefined> {
  const res = await fetch(`${API_URL}/api/task/${encodeURIComponent(taskId)}`, { cache: "no-store" });
  if (!res.ok) return undefined;
  const t = (await res.json()) as {
    task_id: string; title: string; revision: string; revdate: string; effrg: string | null;
    causes: { name: string; fin: string | null }[]; refs: { man: string; ref: string; title: string }[]; steps: string[];
  };
  return {
    id: manualSlug(`TSM ${t.task_id}`),
    title: t.title,
    revision: `Controlled source · TSM ${t.revision} · task revised ${t.revdate}`,
    effectivity: !t.effrg || t.effrg === "001999" ? "All aircraft" : `${t.effrg} (confirm against the MSN)`,
    steps: t.steps,
    fromDossier,
    causes: t.causes.map((c) => (c.fin ? `${c.name} (${c.fin})` : c.name)),
    refs: t.refs,
  };
}

/** TSM tasks referenced in tonight's brief, for the Manuals list and search. Steps load on the task page. */
export function referencedTasks(b: BBrief): ManualTask[] {
  const out = new Map<string, ManualTask>();
  for (const d of b.dossiers) {
    for (const [k, ev] of Object.entries(d.evidence)) {
      if (k.startsWith("tsm:") && !out.has(k)) {
        out.set(k, {
          id: manualSlug(`TSM ${k.slice(4)}`),
          title: ev.label.split(" · ")[1] ?? ev.label,
          revision: ev.revision ? `TSM ${ev.revision}` : "",
          effectivity: d.reg,
          steps: [],
          fromDossier: slug(d.item_id),
        });
      }
    }
  }
  return [...out.values()];
}

// ---------- engineers ----------
export async function fetchEngineers(): Promise<Engineer[]> {
  const rows = await get<{ engineer_id: string; name: string; licence?: string }[]>("/engineers");
  return rows.map((e) => ({ id: e.engineer_id, name: e.name }));
}

// ---------- source sheet ----------
const SYSTEM: Record<string, string> = {
  wo: "AMOS", tsm: "Manuals", amm: "Manuals", pha: "PHA", rule: "Rules", stock: "Stores", tool: "Tools", ep: "AVIATAR", aviatar: "AVIATAR",
};

/** A work order from AMOS, or the evidence record held in tonight's brief, as a source-sheet preview. */
export async function fetchSource(ref: string, b: BBrief): Promise<SourceRecord | undefined> {
  const prefix = ref.split(":")[0];
  const label = evRef(ref).id;
  const manualTaskId = prefix === "tsm" ? manualSlug(`TSM ${ref.slice(4)}`) : undefined;
  if (prefix === "wo") {
    const res = await fetch(`${API_URL}/api/wo/${encodeURIComponent(ref.slice(3))}`, { cache: "no-store" });
    if (res.ok) {
      const w = (await res.json()) as Record<string, string | null>;
      const fields: [string, string][] = [
        ["Tail", w.reg ?? ""], ["Type", w.wo_type ?? ""], ["ATA", w.ata ?? ""], ["State", w.state ?? ""],
        ["Opened", w.date_opened ?? ""],
      ];
      if (w.date_closed) fields.push(["Closed", w.date_closed]);
      const actions = (w.actions ?? "").split(" | ").filter(Boolean);
      return {
        id: label, system: "AMOS", title: clean(w.description ?? `Work order ${w.wo_number}`),
        fields: fields.filter(([, v]) => v),
        excerpt: actions.length ? actions.join("\n") : undefined,
      };
    }
  }
  for (const d of b.dossiers) {
    const ev = d.evidence[ref];
    if (ev) {
      const fields: [string, string][] = [["Tail", d.reg], ["Source", ev.source]];
      if (ev.revision) fields.push(["Revision", ev.revision]);
      fields.push(["Controlled source", ev.approved ? "Yes" : "No"]);
      return { id: label, system: SYSTEM[prefix] ?? ev.source, title: ev.label, fields, excerpt: ev.excerpt || undefined, manualTaskId };
    }
  }
  return undefined;
}
