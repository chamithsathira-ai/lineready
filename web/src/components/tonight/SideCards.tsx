import { ShieldCheck } from "lucide-react";
import type { GapState, ShiftBrief } from "@/lib/types";
import { Card, CardHead, StatusBadge } from "@/components/ui";

const GAP_STATE: Record<GapState, { cls: string; label: (owner?: string) => string }> = {
  sent: { cls: "badge-info", label: () => "Sent · awaiting lead" },
  acknowledged: { cls: "badge-neutral", label: (o) => `Acknowledged${o ? ` · ${o}` : ""}` },
  resolved: { cls: "badge-ok", label: (o) => `Resolved${o ? ` · ${o}` : ""}` },
};

export function ReadinessGapsCard({ brief }: { brief: ShiftBrief }) {
  const open = brief.readinessGaps.filter((g) => g.state !== "resolved").length;
  return (
    <Card>
      <CardHead kicker={`Sent to shift lead ${brief.readinessSentAt}`} title="Readiness gaps" right={<StatusBadge status={open ? "info" : "ok"}>{open} open</StatusBadge>} />
      {brief.readinessGaps.map((g) => (
        <div className="gap" key={g.id}>
          <div className="row wrap">
            <span className="t-data">{g.tail}</span>
            <span className={`badge ${GAP_STATE[g.state].cls}`}>{GAP_STATE[g.state].label(g.owner)}</span>
          </div>
          <p className="t-strong">{g.title}</p>
          <p className="t-caption">
            {g.detail} {g.evidence.map((e) => e.id).join(", ")}.
          </p>
        </div>
      ))}
    </Card>
  );
}

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
