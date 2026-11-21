"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import type { ManualTask } from "@/lib/types";
import { manualRef } from "@/lib/manuals";

export function ManualList({ tasks }: { tasks: ManualTask[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = tasks.filter((t) => words.every((w) => `${t.title} ${manualRef(t.id)} ${t.effectivity}`.toLowerCase().includes(w)));
  return (
    <div className="col" style={{ maxWidth: 880 }}>
      <label className="search" style={{ width: "100%" }}>
        <Search size={18} aria-hidden />
        <input type="search" placeholder="Filter by task number or title" aria-label="Filter manual tasks" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {shown.map((t) => (
        <Link key={t.id} href={`/manuals/${t.id}`} className="src">
          <span className="ico ico-neutral">
            <BookOpen size={20} aria-hidden />
          </span>
          <span className="src-text">
            <span className="t-strong">{t.title}</span>
            <span className="t-caption">
              <span className="t-data">{manualRef(t.id)}</span> · {t.steps.length} steps · {t.effectivity}
            </span>
          </span>
          <span className="grow" />
          <ChevronRight size={20} className="muted" aria-hidden />
        </Link>
      ))}
      {shown.length === 0 && <p className="t-caption">No task matches &ldquo;{q}&rdquo;.</p>}
    </div>
  );
}
