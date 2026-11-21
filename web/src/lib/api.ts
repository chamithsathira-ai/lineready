import "server-only";
import { cookies } from "next/headers";
import type { AskExchange, CoachExercise, Dossier, ManualTask, ReadinessRow, ShiftBrief } from "@/lib/types";
import { mockBrief } from "@/lib/mock/brief";
import { askSuggestions, mockAsk, mockCoach, mockDossiers, mockManualTasks, mockReadiness } from "@/lib/mock/screens";
import {
  API_URL, fetchBrief, fetchManualTask, referencedTasks, slug, toDossier, toReadiness, toShiftBrief, type BBrief,
} from "@/lib/backend";

/**
 * Data access for the UI. With LINEREADY_API_URL set (see .env.local) every screen reads the FastAPI
 * backend through the adapter in backend.ts; without it the UI falls back to local mock data for demos.
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

export async function getManualTask(id?: string, fromDossier?: string): Promise<ManualTask | undefined> {
  if (!LIVE) return mockManualTasks.find((t) => t.id === id) ?? mockManualTasks[0];
  return id ? fetchManualTask(id, fromDossier) : undefined;
}

export async function getReferencedTasks() {
  if (!LIVE) return [];
  return referencedTasks(await rawBrief());
}

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

/** Evidence detail for the Source screen: a work order from AMOS, or the record held in tonight's brief. */
export async function getSource(ref: string) {
  if (!LIVE) return undefined;
  if (ref.startsWith("wo:")) {
    const res = await fetch(`${API_URL}/api/wo/${encodeURIComponent(ref.slice(3))}`, { cache: "no-store" });
    if (res.ok) {
      const w = (await res.json()) as Record<string, string | null>;
      return { kind: "wo" as const, label: `WO ${w.wo_number} · ${w.reg} · ${w.wo_type} · ATA ${w.ata}`, approved: true,
        source: `AMOS · ${w.state}`, meta: `Opened ${w.date_opened}${w.date_closed ? ` · closed ${w.date_closed}` : ""}`,
        body: [w.description ?? "", ...(w.actions ?? "").split(" | ")].filter(Boolean), url: null as string | null };
    }
  }
  const b = await rawBrief();
  for (const d of b.dossiers) {
    const ev = d.evidence[ref];
    if (ev) {
      return { kind: "evidence" as const, label: ev.label, approved: ev.approved, source: ev.source,
        meta: ev.revision ?? "", body: [ev.excerpt], url: ev.url };
    }
  }
  return undefined;
}
