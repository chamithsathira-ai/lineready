import type { SourceRecord } from "@/lib/types";

// Sample source previews for the demo. Field values are illustrative, not real records.
export const mockSources: SourceRecord[] = [
  {
    id: "WO 6204647",
    system: "AMOS",
    title: "Work order · deferred item",
    fields: [["Tail", "A6-AQP"], ["Status", "Open"], ["Deferral limit", "20 Oct 2026"], ["Raised", "17 Oct 2026"]],
    excerpt: "Deferred under MEL. Limit in the action text passed 20 Oct; day shift asked MCC to confirm status 20 Nov 13:55, no reply recorded.",
  },
  {
    id: "Rule DEADLINE-01",
    system: "Rules",
    title: "Deadline watch",
    fields: [["Applies to", "Deferred and MEL items"], ["Trigger", "Limit before or at next departure"]],
    excerpt: "Flag any deferred item whose limit is passed or ends before the aircraft's next scheduled departure.",
  },
  {
    id: "AVIATAR episode",
    system: "AVIATAR",
    title: "Fault episode · NAV ADS-B RPTG 1 FAULT",
    fields: [["Tail", "A6-ARM"], ["ATA", "34"], ["Occurrences", "3 in last 10 sectors"], ["Linked messages", "MMR 1 FAULT, MMR 2 FAULT"]],
  },
  {
    id: "Rule REP-01",
    system: "Rules",
    title: "Repetitive defect",
    fields: [["Trigger", "3 or more reports on the same ATA within 10 sectors"]],
    excerpt: "A defect meeting this rule is flagged repetitive and gets a full dossier.",
  },
  {
    id: "TSM 34-52",
    system: "Manuals",
    title: "TSM 34-52 · ADS-B fault isolation",
    fields: [["Revision", "01 Nov 2026"], ["Effectivity", "Confirm MSN"]],
    manualTaskId: "tsm-34-52-00-810-801",
  },
  {
    id: "PHA ce65968c",
    system: "PHA",
    title: "Health case · Brake 1 temperature",
    fields: [["Tail", "A6-AOJ"], ["Opened", "19 Nov 2026"], ["Confidence", "Medium"], ["Type", "Prediction, not a fault"]],
  },
  {
    id: "TSM 32-42-00-810-923",
    system: "Manuals",
    title: "TSM 32-42-00-810-923-A · BRAKES HOT",
    fields: [["Revision", "01 Nov 2026"]],
    manualTaskId: "tsm-32-42-00-810-923-a",
  },
  {
    id: "TSM 32-42-00-810-923-A",
    system: "Manuals",
    title: "TSM 32-42-00-810-923-A · BRAKES HOT",
    fields: [["Revision", "01 Nov 2026"]],
    manualTaskId: "tsm-32-42-00-810-923-a",
  },
  {
    id: "Stores C20225510",
    system: "Stores",
    title: "MLG brake assembly",
    fields: [["Location", "SHJLINE"], ["Quantity", "1"], ["Condition", "Unserviceable"], ["Alternate P/N", "None in stock"]],
  },
  {
    id: "IPC 32-42",
    system: "Manuals",
    title: "IPC 32-42 · Brakes",
    fields: [["Revision", "01 Nov 2026"]],
  },
  {
    id: "Tool T-11872",
    system: "Tools",
    title: "ADS-B test set",
    fields: [["Location", "Hangar 2, bay 4"], ["Calibration due", "20 Nov 2026"]],
  },
  {
    id: "TLB 0458812",
    system: "Tech log",
    title: "Pilot report · FWD lavatory flush inoperative",
    fields: [["Tail", "A6-ANS"], ["Reported", "20 Nov 2026 21:30"]],
  },
  {
    id: "MMEL 38",
    system: "Manuals",
    title: "MMEL 38 · Water and waste",
    fields: [["Note", "Check the operator MEL before deferral"]],
  },
];
