// Domain types for the UI. They mirror the agent contracts in the architecture doc
// (Brief, Claim, Evidence, Flag) so the mock data can later be swapped for the FastAPI responses.

/**
 * Status meaning is fixed across the app:
 * act = act before departure (the only use of red), info = for information / predictive,
 * prep = needs preparation, ok = ready or exact controlled-source match, train = training.
 */
export type Status = "act" | "info" | "prep" | "ok" | "train";

/** A pointer to a source record. Every AI claim in the UI must carry at least one. */
export interface EvidenceRef {
  id: string; // e.g. "WO 6185232", "rule REP-01", "TSM 34-52"
  kind?: "wo" | "rule" | "manual" | "aviatar" | "pha" | "stores" | "techlog" | "tool" | "other";
}

export type DefectSource = "AMOS" | "AVIATAR" | "PHA" | "PIREP" | "MAREP";

export type BriefCategory = "deadline" | "repetitive" | "predictive" | "techlog" | "scheduled";

export interface BriefItem {
  id: string;
  tail: string;
  category: BriefCategory;
  status: Status;
  source: DefectSource;
  title: string;
  detail: string;
  evidence: EvidenceRef[];
  /** The single item shown as "Next up". */
  pinned?: boolean;
  dossierId?: string;
}

export interface AircraftOnShift {
  tail: string;
  type: string;
  stand: string;
  /** "02:40", or null for a night stop. */
  departure: string | null;
  /** Minutes from shift start (clamped to the shift window). */
  arriveMin: number;
  departMin: number;
  status: Status;
}

export type GapState = "sent" | "acknowledged" | "resolved";

export interface ReadinessGap {
  id: string;
  tail: string;
  title: string;
  detail: string;
  state: GapState;
  owner?: string;
  evidence: EvidenceRef[];
}

export interface ShiftBrief {
  station: string; // "SHJ Line"
  shiftLabel: string; // "Night shift · Fri 20 Nov"
  window: string; // "22:00 to 06:00"
  shiftStartHour: number; // 22
  shiftMinutes: number;
  /** Minutes since shift start, as of when the brief was served. */
  nowMin: number;
  engineer: string;
  version: string;
  builtAt: string;
  verified: boolean;
  items: BriefItem[];
  aircraft: AircraftOnShift[];
  readinessGaps: ReadinessGap[];
  readinessSentAt: string;
  handover: { from: string; at: string; text: string };
}

export interface TimelineEvent {
  when: string;
  text: string;
  hot?: boolean;
}

export interface HistoryRow {
  date: string;
  tail: string;
  action: string;
  outcome: string;
  recurred: boolean;
}

export interface ReferenceRow {
  id: string;
  title: string;
  exact: boolean;
}

export interface PartRow {
  item: string;
  ref: string;
  stock: string;
  status: Status;
  statusLabel: string;
}

export interface Dossier {
  id: string;
  itemId: string;
  version: string;
  summary: string;
  timeline: TimelineEvent[];
  nextStep: string;
  manualTaskId?: string;
  history: HistoryRow[];
  references: ReferenceRow[];
  revision?: string;
  parts: PartRow[];
}

export interface ManualTask {
  id: string;
  title: string;
  revision: string;
  effectivity: string;
  steps: string[];
  fromDossier?: string;
}

export interface ReadinessRow {
  tail: string;
  departure: string;
  parts: Status;
  tools: Status;
  manuals: Status;
  note: string;
}

export interface CoachExercise {
  title: string;
  intro: string;
  feedback: { status: Status; label: string; text: string }[];
  hint: EvidenceRef;
  competency: { name: string; met: number; total: number };
}

export interface AskExchange {
  question: string;
  answer: string;
  caution: string;
  evidence: EvidenceRef[];
}
