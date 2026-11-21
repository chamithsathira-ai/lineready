"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ShiftBrief } from "@/lib/types";
import { Meter } from "@/components/ui";
import { useAppState } from "./AppState";
import { SearchField } from "./SearchField";

/** Shift context, review progress, trust badge and search. Shared by Tonight and Readiness. */
export function ShiftHeader({ brief, title }: { brief: ShiftBrief; title: string }) {
  const { reviews } = useAppState();
  const [showTrust, setShowTrust] = useState(false);
  const done = brief.items.filter((i) => reviews[i.id]).length;
  return (
    <header className="shift">
      <div className="shift-who">
        <p className="t-caption">
          {brief.station} · {brief.shiftLabel} · {brief.window}
        </p>
        <h1 className="t-display">{title}</h1>
      </div>
      <span className="grow" />
      <Meter value={done} total={brief.items.length} label={`${done} of ${brief.items.length} reviewed`} width={120} />
      {brief.verified && (
        <div className="trust">
          <button type="button" className="badge badge-ok" aria-expanded={showTrust} onClick={() => setShowTrust((s) => !s)}>
            <ShieldCheck size={16} aria-hidden />
            Verified {brief.builtAt}
          </button>
          {showTrust && (
            <p className="trust-pop card t-caption" role="status">
              Brief {brief.version} built {brief.builtAt} from AMOS, AVIATAR, PHA and the tech log. Every item has a source.
            </p>
          )}
        </div>
      )}
      <SearchField />
    </header>
  );
}
