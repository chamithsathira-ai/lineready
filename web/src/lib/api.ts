import type { AskExchange, CoachExercise, Dossier, Engineer, ManualTask, ReadinessRow, SearchEntry, ShiftBrief, SourceRecord } from "@/lib/types";
import { mockBrief } from "@/lib/mock/brief";
import { askSuggestions, engineers, mockAsk, mockCoach, mockDossiers, mockManualTasks, mockReadiness } from "@/lib/mock/screens";
import { mockSources } from "@/lib/mock/sources";
import { CATEGORY_LABEL } from "@/lib/format";
import { manualSlug } from "@/lib/manuals";

/**
 * Data access for the UI. Set LINEREADY_API_URL (e.g. http://localhost:8000) to read the shift brief
 * from the FastAPI backend; without it the UI uses local mock data so it can be built and demoed first.
 * The other screens use mock data until their endpoints exist.
 */
const API_URL = process.env.LINEREADY_API_URL;

export async function getShiftBrief(): Promise<ShiftBrief> {
  if (!API_URL) return mockBrief;
  const res = await fetch(`${API_URL}/brief/current`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Brief request failed: ${res.status}`);
  return (await res.json()) as ShiftBrief;
}

export async function getDossier(id: string): Promise<Dossier | undefined> {
  return mockDossiers.find((d) => d.id === id);
}

export async function getManualTask(id: string): Promise<ManualTask | undefined> {
  return mockManualTasks.find((t) => t.id === id);
}

export async function getManualTasks(): Promise<ManualTask[]> {
  return mockManualTasks;
}

export async function getDossiers(): Promise<Dossier[]> {
  return mockDossiers;
}

export async function getSource(id: string): Promise<SourceRecord | undefined> {
  return mockSources.find((s) => s.id.toLowerCase() === id.toLowerCase());
}

export async function getEngineers(): Promise<Engineer[]> {
  return engineers;
}

/** Search over tonight's aircraft, items, evidence ids, manual tasks and parts. */
export async function search(query: string): Promise<SearchEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const brief = await getShiftBrief();
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
    ...mockManualTasks.map((m) => ({
      kind: "manual" as const,
      label: m.title,
      detail: m.id.toUpperCase(),
      href: `/manuals/${m.id}`,
      terms: `${m.title} ${m.id} ${m.id.replace(/-/g, " ")}`,
    })),
    ...mockDossiers.flatMap((d) =>
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
  return mockReadiness;
}

export async function getCoachExercise(): Promise<CoachExercise> {
  return mockCoach;
}

export async function getAskHistory(): Promise<{ exchanges: AskExchange[]; suggestions: string[] }> {
  return { exchanges: mockAsk, suggestions: askSuggestions };
}
