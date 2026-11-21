"use client";

import Link from "next/link";
import { CalendarClock, Check, ChevronRight, Info, NotebookPen, OctagonAlert, Radio, Repeat } from "lucide-react";
import type { BriefCategory, BriefItem } from "@/lib/types";
import { StatusIcon } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/format";
import { useAppState } from "@/components/shell/AppState";

const CATEGORY_ICON: Record<BriefCategory, typeof Info> = {
  deadline: OctagonAlert,
  repetitive: Repeat,
  predictive: Info,
  techlog: NotebookPen,
  scheduled: CalendarClock,
  fault: Radio,
};

/** One item row: reason icon, title, reason and source count, review state. Opens the dossier. */
export function ItemRow({ item }: { item: BriefItem }) {
  const { reviews } = useAppState();
  const done = Boolean(reviews[item.id]);
  return (
    <Link href={`/dossier/${item.dossierId ?? item.id}`} className="item">
      <StatusIcon status={item.status} icon={CATEGORY_ICON[item.category]} />
      <span>
        <span className="t-strong">{item.title}</span>
        <span className="item-meta">
          <span className={`t-label c-${item.status}`}>{CATEGORY_LABEL[item.category]}</span>
          <span className="t-caption">
            {item.source} · {item.evidence.length} sources
          </span>
        </span>
      </span>
      <span className={`rev${done ? " rev-done" : ""}`}>
        {done && <Check size={18} aria-hidden />}
        {done ? "Reviewed" : "To review"}
        <ChevronRight size={20} aria-hidden />
      </span>
    </Link>
  );
}
