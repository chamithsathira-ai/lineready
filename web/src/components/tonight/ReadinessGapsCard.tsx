"use client";

import { useState } from "react";
import type { Engineer, GapState, ReadinessGap } from "@/lib/types";
import { Button, Card, CardHead, SourceChip, StatusBadge } from "@/components/ui";
import { useAppState } from "@/components/shell/AppState";

const GAP_STATE: Record<GapState, { cls: string; label: (owner?: string) => string }> = {
  sent: { cls: "badge-info", label: () => "Sent · awaiting lead" },
  acknowledged: { cls: "badge-neutral", label: (o) => `Acknowledged${o ? ` · ${o}` : ""}` },
  resolved: { cls: "badge-ok", label: (o) => `Resolved${o ? ` · ${o}` : ""}` },
};

/**
 * Readiness gaps. Engineers see the status; the shift lead can acknowledge, reassign and resolve.
 * Updates show on every screen (they live in app state until the readiness API exists).
 */
export function ReadinessGapsCard({ gaps, sentAt, engineers = [], actions = false }: { gaps: ReadinessGap[]; sentAt: string; engineers?: Engineer[]; actions?: boolean }) {
  const { gaps: updates, updateGap } = useAppState();
  const [assigning, setAssigning] = useState<string | null>(null);
  const merged = gaps.map((g) => ({ ...g, ...updates[g.id] }));
  const open = merged.filter((g) => g.state !== "resolved").length;

  return (
    <Card>
      <CardHead kicker={`Sent to shift lead ${sentAt}`} title="Readiness gaps" right={<StatusBadge status={open ? "info" : "ok"}>{open ? `${open} open` : "All closed"}</StatusBadge>} />
      {merged.map((g) => (
        <div className="gap" key={g.id}>
          <div className="row wrap">
            <span className="t-data">{g.tail}</span>
            <span className={`badge ${GAP_STATE[g.state].cls}`}>{GAP_STATE[g.state].label(g.owner)}</span>
          </div>
          <p className="t-strong">{g.title}</p>
          <p className="t-caption">{g.detail}</p>
          <div className="row wrap">
            {g.evidence.map((e) => (
              <SourceChip key={e.id} evidence={e} />
            ))}
          </div>
          {actions && g.state !== "resolved" && (
            <div className="row wrap" style={{ marginTop: 4 }}>
              {g.state === "sent" && <Button onClick={() => updateGap(g.id, { state: "acknowledged", owner: "You" })}>Acknowledge</Button>}
              <Button kind="secondary" aria-expanded={assigning === g.id} onClick={() => setAssigning(assigning === g.id ? null : g.id)}>
                Reassign
              </Button>
              <Button kind="secondary" onClick={() => updateGap(g.id, { state: "resolved", owner: g.owner ?? "You" })}>
                Mark resolved
              </Button>
            </div>
          )}
          {actions && assigning === g.id && (
            <div className="seg seg-row" role="group" aria-label={`Assign ${g.title}`}>
              {engineers.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={g.owner === e.name}
                  onClick={() => {
                    updateGap(g.id, { state: "acknowledged", owner: e.name });
                    setAssigning(null);
                  }}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}
          {actions && g.state === "resolved" && (
            <div>
              <Button kind="quiet" onClick={() => updateGap(g.id, { state: "acknowledged", owner: g.owner })}>
                Reopen
              </Button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
