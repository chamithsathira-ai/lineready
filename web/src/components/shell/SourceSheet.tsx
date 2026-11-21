"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, X } from "lucide-react";
import type { EvidenceRef, SourceRecord } from "@/lib/types";

type Loaded = { state: "loading" } | { state: "ok"; record: SourceRecord } | { state: "missing" };

const Ctx = createContext<(e: EvidenceRef) => void>(() => {});

/** Opens a source record in a side sheet, so the engineer can check a claim without losing their place. */
export function useOpenSource() {
  return useContext(Ctx);
}

export function SourceSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<EvidenceRef | null>(null);
  const [data, setData] = useState<Loaded>({ state: "loading" });
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const openSource = useCallback((e: EvidenceRef) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(e);
  }, []);
  const close = useCallback(() => {
    setOpen(null);
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData({ state: "loading" });
    fetch(`/api/sources/${encodeURIComponent(open.ref ?? open.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((record: SourceRecord | null) => alive && setData(record ? { state: "ok", record } : { state: "missing" }))
      .catch(() => alive && setData({ state: "missing" }));
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <Ctx.Provider value={openSource}>
      {children}
      {open && (
        <div className="sheet-backdrop" onClick={close}>
          <aside className="sheet" role="dialog" aria-modal="true" aria-label={`Source ${open.id}`} onClick={(e) => e.stopPropagation()}>
            <header className="row">
              <div className="grow">
                <p className="t-caption">{data.state === "ok" ? data.record.system : "Source"}</p>
                <h2 className="t-title t-data-title">{open.id}</h2>
              </div>
              <button ref={closeRef} type="button" className="btn btn-secondary btn-icon" aria-label="Close" onClick={close}>
                <X size={20} aria-hidden />
              </button>
            </header>
            {data.state === "loading" && <p className="t-caption">Loading the record…</p>}
            {data.state === "missing" && (
              <p className="muted">No preview for this record in this build. Open it in its source system to check it.</p>
            )}
            {data.state === "ok" && (
              <>
                <p className="t-heading">{data.record.title}</p>
                <dl className="fields">
                  {data.record.fields.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                {data.record.excerpt && <p className="excerpt">{data.record.excerpt}</p>}
                {data.record.manualTaskId && (
                  <Link href={`/manuals/${data.record.manualTaskId}`} className="btn btn-primary" onClick={() => setOpen(null)}>
                    <BookOpen size={18} aria-hidden />
                    Open manual task
                  </Link>
                )}
                <p className="t-caption">Preview from {data.record.system}. The source system is the record of truth.</p>
              </>
            )}
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}
