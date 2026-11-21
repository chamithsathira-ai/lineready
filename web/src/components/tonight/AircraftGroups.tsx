"use client";

import Link from "next/link";
import { ItemRow } from "./ItemRow";
import { useMemo, useState } from "react";
import type { BriefCategory, BriefItem, ShiftBrief } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { timeLeft } from "@/lib/format";

type Filter = "all" | "act" | BriefCategory;

const FILTERS: { id: Filter; label: string; match: (i: BriefItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "act", label: "Act now", match: (i) => i.status === "act" },
  { id: "repetitive", label: "Repetitive", match: (i) => i.category === "repetitive" },
  { id: "predictive", label: "Predictive", match: (i) => i.category === "predictive" },
  { id: "techlog", label: "Tech log", match: (i) => i.category === "techlog" },
  { id: "scheduled", label: "Scheduled", match: (i) => i.category === "scheduled" },
];

/** Filter chips + items grouped by aircraft, in departure order. Counts live only on the chips. */
export function AircraftGroups({ brief }: { brief: ShiftBrief }) {
  const [filter, setFilter] = useState<Filter>("all");
  const active = FILTERS.find((f) => f.id === filter)!;
  const chips = FILTERS.filter((f) => f.id === "all" || brief.items.some(f.match));
  const ordered = useMemo(
    () => [...brief.aircraft].sort((a, b) => (a.departure ? a.departMin : 9999) - (b.departure ? b.departMin : 9999)),
    [brief.aircraft],
  );

  const groups = ordered
    .map((a) => ({ a, items: brief.items.filter((i) => i.tail === a.tail && active.match(i)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="chips" role="group" aria-label="Filter items">
        {chips.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
            {f.label} <span>{brief.items.filter(f.match).length}</span>
          </button>
        ))}
      </div>
      <p className="t-caption">Grouped by aircraft, in departure order.</p>

      {groups.map(({ a, items }) => {
        const left = timeLeft(brief, a);
        return (
          <section key={a.tail} id={`ac-${a.tail}`} className="card ac" aria-label={a.tail}>
            <header className="ac-head">
              <Link href={`/aircraft/${a.tail}`} className="ac-tail link">{a.tail}</Link>
              <span className="t-caption">
                {a.type} · Stand {a.stand}
              </span>
              <span className="grow" />
              <span className="t-label">{left ? `Departs ${a.departure} · in ${left}` : "On ground all night"}</span>
              <StatusBadge status={a.status} />
            </header>
            {items.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </section>
        );
      })}

      {groups.length === 0 && (
        <div className="card">
          <p className="t-heading">Nothing in this view tonight</p>
          <p className="t-caption">Choose All to see every item.</p>
        </div>
      )}
    </>
  );
}
