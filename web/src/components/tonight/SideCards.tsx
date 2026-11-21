import { ShieldCheck } from "lucide-react";
import type { ShiftBrief } from "@/lib/types";
import { Card, CardHead } from "@/components/ui";
export { ReadinessGapsCard } from "./ReadinessGapsCard";

export function HandoverCard({ brief }: { brief: ShiftBrief }) {
  return (
    <Card>
      <CardHead kicker={`${brief.handover.from} · ${brief.handover.at}`} title="Last handover" />
      <p>{brief.handover.text}</p>
    </Card>
  );
}

export function ResponsibilityNote() {
  return (
    <p className="t-caption row" style={{ alignItems: "flex-start", gap: 10 }}>
      <ShieldCheck size={18} aria-hidden style={{ flex: "none", marginTop: 1 }} />
      <span>LineReady gathers and cites. Troubleshooting, deferral and certification decisions stay with you.</span>
    </p>
  );
}
