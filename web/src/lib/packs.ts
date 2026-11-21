import "server-only";
import { API_URL } from "@/lib/backend";

export interface PackBoardRow {
  reg: string; arrival: string | null; departure: string | null; stand: string | null;
  minutes_to_arrival: number | null; state: "ready" | "due" | "scheduled"; built_at: string | null; builds_at: string | null;
}

export async function getPackBoard(engineerId: string, at?: string): Promise<PackBoardRow[]> {
  if (!API_URL) return [];
  const q = at ? `?at=${encodeURIComponent(at)}` : "";
  const res = await fetch(`${API_URL}/api/packs/${encodeURIComponent(engineerId)}${q}`, { cache: "no-store" });
  return res.ok ? ((await res.json()) as PackBoardRow[]) : [];
}

export interface Pack {
  reg: string; built_at: string; trigger: string; arrival: string | null; departure: string | null; stand: string | null;
  flight_out: string | null; ground_minutes: number; aircraft: { msn: string; cec: number; model: string; engine: string } | null;
  items: { item_id: string; title: string; summary: string; flags: { rule_id: string; severity: string; title: string }[] }[];
  clear_now: { wo: string; type: string; opened: string; ata: string; text: string; deferral: string; why: string;
    parts: { pn: string; in_stock: boolean }[] }[];
  parts: { text: string; evidence: string[]; kind: string }[];
  tools: { text: string; evidence: string[]; kind: string }[];
  manual_pages: { ref: string; label: string }[];
  history: { wo_number: string; wo_type: string; date_opened: string; ata: string; description: string; state: string }[];
  gaps: string[];
}

export async function getPack(reg: string): Promise<Pack | undefined> {
  if (!API_URL) return undefined;
  const res = await fetch(`${API_URL}/api/pack/${encodeURIComponent(reg)}`, { cache: "no-store" });
  return res.ok ? ((await res.json()) as Pack) : undefined;
}
