import "server-only";
import { cookies } from "next/headers";
import type { AskExchange, CoachExercise, Dossier, Engineer, ManualTask, ReadinessRow, SearchEntry, ShiftBrief, SourceRecord } from "@/lib/types";
import { mockBrief } from "@/lib/mock/brief";
import { askSuggestions, engineers, mockAsk, mockCoach, mockDossiers, mockManualTasks, mockReadiness } from "@/lib/mock/screens";
import { mockSources } from "@/lib/mock/sources";
import { CATEGORY_LABEL } from "@/lib/format";
import { manualRef, manualSlug } from "@/lib/manuals";
import {
  API_URL, fetchBrief, fetchEngineers, fetchManualTask, fetchSource, referencedTasks, slug, toDossier, toReadiness, toShiftBrief,
  type BBrief,
} from "@/lib/backend";

/**
 * Data access for the UI. With LINEREADY_API_URL set (e.g. http://localhost:8000) every screen reads the
 * FastAPI backend through the adapter in backend.ts; without it the UI falls back to local mock data so it
 * can be built and demoed on its own.
 */
export const LIVE = Boolean(API_URL);
export const ENGINEER_COOKIE = "lr-engineer";

/** The engineer whose brief is shown; chosen in the "Me" menu, stored in a cookie. */
export async function getEngineerId(): Promise<string> {
  return (await cookies()).get(ENGINEER_COOKIE)?.value ?? "E1";
}

async function rawBrief(): Promise<BBrief> {
  return fetchBrief(await getEngineerId());
}

export async function getShiftBrief(): Promise<ShiftBrief> {
  if (!LIVE) return mockBrief;
  return toShiftBrief(await rawBrief());
}

export async function getDossier(id: string): Promise<Dossier | undefined> {
  if (!LIVE) return mockDossiers.find((d) => d.id === id);
  const b = await rawBrief();
  const d = b.dossiers.find((x) => slug(x.item_id) === id);
  return d ? toDossier(d, b.brief_id) : undefined;
}

export async function getDossiers(): Promise<Dossier[]> {
  if (!LIVE) return mockDossiers;
  const b = await rawBrief();
  return b.dossiers.map((d) => toDossier(d, b.brief_id));
}

/** A manual task by its slug ("tsm-32-42-00-810-923-a"). */
export async function getManualTask(id: string, fromDossier?: string): Promise<ManualTask | undefined> {
  if (!LIVE) {
    const t = mockManualTasks.find((x) => x.id === id);
    return t && fromDossier ? { ...t, fromDossier } : t;
  }
  const ref = manualRef(id); // "TSM 32-42-00-810-923-A"
  if (!ref.startsWith("TSM ")) return undefined; // only the TSM is loaded in the backend
  return fetchManualTask(ref.slice(4), fromDossier);
}

/** Manual tasks for tonight: the mock set, or the TSM tasks referenced in the live brief. */
export async function getManualTasks(): Promise<ManualTask[]> {
  if (!LIVE) return mockManualTasks;
  return referencedTasks(await rawBrief());
}

/** Preview of a source record for the source sheet. Live ids are backend evidence ids ("wo:6204647"). */
export async function getSource(id: string): Promise<SourceRecord | undefined> {
  if (LIVE && id.includes(":")) return fetchSource(id, await rawBrief());
  return mockSources.find((s) => s.id.toLowerCase() === id.toLowerCase());
}

export async function getEngineers(): Promise<Engineer[]> {
  if (!LIVE) return engineers;
  return fetchEngineers().catch(() => engineers);
}

/** Search over tonight's aircraft, items, evidence ids, manual tasks and parts. */
export async function search(query: string): Promise<SearchEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const [brief, tasks, dossiers] = await Promise.all([getShiftBrief(), getManualTasks(), getDossiers()]);
  const entries: SearchEntry[] = [
    ...brief.aircraft.map((a) => ({
      kind: "aircraft" as const,
      label: a.tail,
      detail: `${a.type} · Stand ${a.stand} · ${a.departure ? `Departs ${a.departure}` : "Night stop"}`,
      href: `/aircraft/${a.tail}`,
      terms: `${a.tail} ${a.type}`,
    })),
    ...brief.items.map((i) => ({
      kind: "item" as const,
      label: i.title,
      detail: `${i.tail} · ${CATEGORY_LABEL[i.category]}`,
      href: `/dossier/${i.dossierId ?? i.id}`,
      terms: `${i.title} ${i.detail} ${i.tail} ${i.source} ${i.evidence.map((e) => e.id).join(" ")}`,
    })),
    ...tasks.map((m) => ({
      kind: "manual" as const,
      label: m.title,
      detail: manualRef(m.id),
      href: `/manuals/${m.id}`,
      terms: `${m.title} ${m.id} ${m.id.replace(/-/g, " ")}`,
    })),
    ...dossiers.flatMap((d) =>
      d.parts.map((p) => ({
        kind: "part" as const,
        label: `${p.item} · ${p.ref}`,
        detail: `${p.stock} · ${p.statusLabel}`,
        href: `/dossier/${d.id}`,
        terms: `${p.item} ${p.ref}`,
      })),
    ),
  ];
  const words = q.split(/\s+/);
  return entries.filter((e) => words.every((w) => e.terms.toLowerCase().includes(w))).slice(0, 8);
}

export { manualSlug };

export async function getReadiness(): Promise<ReadinessRow[]> {
  if (!LIVE) return mockReadiness;
  const b = await rawBrief();
  return toReadiness(b, toShiftBrief(b));
}

export async function getCoachExercise(): Promise<CoachExercise> {
  return mockCoach;
}

export async function getAskHistory(): Promise<{ exchanges: AskExchange[]; suggestions: string[] }> {
  if (!LIVE) return { exchanges: mockAsk, suggestions: askSuggestions };
  const brief = await getShiftBrief();
  const first = brief.items.find((i) => i.category === "repetitive" || i.category === "fault") ?? brief.items[0];
  const suggestions = [
    first ? `What does the TSM say for ${first.title.split(" + ")[0]} on ${first.tail}?` : "What does the TSM say for BRAKES HOT?",
    brief.aircraft[1] ? `Has ${brief.aircraft[1].tail} had this kind of fault before, and what fixed it?` : "Has A6-AOJ had GPS faults before?",
    "Is part 1J520-10360-000 in stock at Sharjah?",
  ];
  return { exchanges: [], suggestions };
}
