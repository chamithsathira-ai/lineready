import type { AskExchange, CoachExercise, Dossier, ManualTask, ReadinessRow } from "@/lib/types";

// Sample records for the demo. History, parts and step text are illustrative, not real data.

export const mockDossiers: Dossier[] = [
  {
    id: "a6-arm-34-52",
    itemId: "b-arm-adsb",
    version: "v2",
    summary: "ADS-B transmit fault reported three times in the last 10 sectors. MMR 1 and 2 fault messages appeared on the same flight, so they are treated as one episode.",
    timeline: [
      { when: "20 Nov 06:05 · Flight G9 793", text: "Fault reported in flight. MMR 1 and 2 messages on the same leg.", hot: true },
      { when: "20 Nov 13:55 · Day shift", text: "Reset on ground, no fault found." },
      { when: "20 Nov 19:40 · Inbound", text: "Fault returned. Third occurrence in 10 sectors.", hot: true },
    ],
    nextStep: "Follow the TSM fault path 34-52-00-810-8xx. Confirm effectivity for this MSN first.",
    manualTaskId: "tsm-34-52-00-810-801",
    history: [
      { date: "02 Nov", tail: "A6-ARM", action: "MMR 1 reset, BITE test passed", outcome: "Returned after 6 sectors", recurred: true },
      { date: "14 Oct", tail: "A6-ARM", action: "Coax connector at MMR 1 cleaned and secured", outcome: "Returned after 9 sectors", recurred: true },
      { date: "28 Sep", tail: "A6-ANV", action: "MMR 1 replaced", outcome: "No recurrence", recurred: false },
      { date: "11 Aug", tail: "A6-ANP", action: "Antenna coax replaced", outcome: "No recurrence", recurred: false },
    ],
    revision: "TSM rev 01 Nov 2026",
    references: [
      { id: "TSM 34-52-00-810-801", title: "ADS-B transmit fault isolation", exact: true },
      { id: "AMM 34-36-00-710-801", title: "MMR operational test", exact: true },
      { id: "IPC 34-36-41", title: "MMR and coax parts", exact: true },
    ],
    parts: [
      { item: "MMR unit", ref: "822-2052-002", stock: "2 serviceable", status: "ok", statusLabel: "Ready" },
      { item: "Coax assembly", ref: "D34361-04", stock: "5 serviceable", status: "ok", statusLabel: "Ready" },
      { item: "ADS-B test set", ref: "T-11872", stock: "Hangar 2, bay 4", status: "info", statusLabel: "Calibration due" },
    ],
  },
  {
    id: "a6-aql-deferral",
    itemId: "b-aql-deadline",
    version: "v1",
    summary: "The deferred item extension ended on 31 Oct and the work order is still open. The aircraft cannot depart on an expired deferral.",
    timeline: [
      { when: "31 Oct", text: "Deferral extension limit reached.", hot: true },
      { when: "20 Nov 13:55 · Day shift", text: "Extension requested from MCC. No reply logged." },
      { when: "Tonight 02:40", text: "Scheduled departure.", hot: true },
    ],
    nextStep: "Call MCC to confirm the extension status before you start other work. If it was not extended, the item must be closed before 02:40.",
    history: [],
    references: [],
    parts: [],
  },
  {
    id: "a6-aoj-brake",
    itemId: "b-aoj-brake",
    version: "v1",
    summary: "PHA predicts a high Brake 1 temperature. This is a prediction, not a fault. Use it to guide the brake inspection.",
    timeline: [
      { when: "19 Nov", text: "Health case opened: Brake 1 temperature trending high.", hot: true },
      { when: "20 Nov 21:02", text: "Readiness gap sent: brake assembly in stores is unserviceable." },
    ],
    nextStep: "Use the health prediction to guide the brake inspection during the night stop.",
    history: [],
    revision: "TSM rev 01 Nov 2026",
    references: [{ id: "TSM 32-42-00-810-923-A", title: "BRAKES HOT fault isolation", exact: true }],
    parts: [{ item: "MLG brake assembly", ref: "C20225510", stock: "1 unserviceable", status: "act", statusLabel: "Gap" }],
  },
  {
    id: "a6-ans-lav",
    itemId: "b-ans-lav",
    version: "v1",
    summary: "Pilot report of an inoperative forward lavatory flush. First occurrence in 30 days.",
    timeline: [{ when: "20 Nov 21:30 · Pilot report", text: "Forward lavatory flush inoperative.", hot: true }],
    nextStep: "Check MMEL item 38 against the operator MEL, then troubleshoot the flush control unit.",
    history: [],
    references: [{ id: "MMEL 38", title: "Lavatory systems", exact: true }],
    parts: [],
  },
];

export const mockManualTasks: ManualTask[] = [
  {
    id: "tsm-34-52-00-810-801",
    title: "ADS-B transmit fault isolation",
    revision: "Controlled revision 01 Nov 2026 · current",
    effectivity: "Confirm MSN",
    fromDossier: "a6-arm-34-52",
    steps: [
      "Do the MMR 1 BITE test from the MCDU.",
      "Read the fault code and find it in table 101.",
      "If code 34-36-21, check the coax connector at MMR 1 for damage.",
      "If no damage, swap MMR 1 and MMR 2 and repeat the test.",
    ],
  },
];

export const mockReadiness: ReadinessRow[] = [
  { tail: "A6-ANS", departure: "01:55", parts: "ok", tools: "ok", manuals: "ok", note: "Ready" },
  { tail: "A6-AQL", departure: "02:40", parts: "ok", tools: "ok", manuals: "ok", note: "Awaiting MCC on deferral" },
  { tail: "A6-ARM", departure: "03:15", parts: "ok", tools: "info", manuals: "ok", note: "Test set calibration due" },
  { tail: "A6-AOJ", departure: "Night stop", parts: "act", tools: "ok", manuals: "ok", note: "Brake assembly unserviceable" },
];

export const mockCoach: CoachExercise = {
  title: "Practice: prepare this defect",
  intro: "A closed A6-ARM ADS-B case, answers hidden. Write your plan, then compare.",
  feedback: [
    { status: "ok", label: "Correct", text: "You picked the ATA 34 ADS-B fault path." },
    { status: "info", label: "Missed", text: "The MMR faults on the same flight are part of the same episode. Why might they matter?" },
  ],
  hint: { id: "TSM fault index 34-36", kind: "manual" },
  competency: { name: "ATA 34 troubleshooting prep", met: 3, total: 5 },
};

export const mockAsk: AskExchange[] = [
  {
    question: "What does the TSM say for BRAKES HOT on A6-AOJ?",
    answer: "The fault index maps BRAKES HOT to TSM 32-42-00-810-923-A (rev 01 Nov 2026). PHA has had an open case for high Brake 1 temperature since 19 Nov.",
    caution: "This is information for your troubleshooting. The decision is yours.",
    evidence: [{ id: "TSM 32-42-00-810-923-A", kind: "manual" }, { id: "PHA ce65968c", kind: "pha" }],
  },
];

export const askSuggestions = ["Has A6-ARM had this before?", "What parts are in stock for ATA 34?", "Which MEL item covers the lav flush?"];
