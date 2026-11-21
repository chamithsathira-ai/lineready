import type { AskExchange, CoachExercise, Dossier, ManualTask, ReadinessRow, ShiftBrief } from "@/lib/types";
import { mockBrief } from "@/lib/mock/brief";
import { askSuggestions, mockAsk, mockCoach, mockDossiers, mockManualTasks, mockReadiness } from "@/lib/mock/screens";

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

export async function getManualTask(id?: string): Promise<ManualTask> {
  return mockManualTasks.find((t) => t.id === id) ?? mockManualTasks[0];
}

export async function getReadiness(): Promise<ReadinessRow[]> {
  return mockReadiness;
}

export async function getCoachExercise(): Promise<CoachExercise> {
  return mockCoach;
}

export async function getAskHistory(): Promise<{ exchanges: AskExchange[]; suggestions: string[] }> {
  return { exchanges: mockAsk, suggestions: askSuggestions };
}
