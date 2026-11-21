import type { AircraftOnShift, BriefCategory, ShiftBrief } from "@/lib/types";

export const CATEGORY_LABEL: Record<BriefCategory, string> = {
  deadline: "Deadline",
  repetitive: "Repetitive",
  predictive: "Health prediction",
  techlog: "Tech log",
  scheduled: "Scheduled",
};

/** "4h 15m" style countdown from now to the aircraft's departure, or null for a night stop. */
export function timeLeft(brief: ShiftBrief, a: AircraftOnShift): string | null {
  if (!a.departure) return null;
  const left = Math.max(0, a.departMin - brief.nowMin);
  return `${Math.floor(left / 60)}h ${left % 60}m`;
}

/** Clock time of "now" within the shift, e.g. "22:25". */
export function nowClock(brief: ShiftBrief): string {
  const total = brief.shiftStartHour * 60 + brief.nowMin;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function greeting(brief: ShiftBrief): string {
  const n = brief.aircraft.length;
  const act = brief.aircraft.filter((a) => a.status === "act").length;
  const lead = `${n} aircraft tonight`;
  if (act === 0) return `${lead}. Nothing blocks a departure.`;
  return `${lead}, ${act} ${act === 1 ? "needs" : "need"} you before departure.`;
}
