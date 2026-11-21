"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ClipboardList, Package, Plane, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/types";

const KIND_ICON: Record<SearchEntry["kind"], typeof Plane> = { aircraft: Plane, item: ClipboardList, manual: BookOpen, part: Package };
const KIND_LABEL: Record<SearchEntry["kind"], string> = { aircraft: "Aircraft", item: "Item", manual: "Manual task", part: "Part" };

/** Global search over tails, items, WO, ATA, part numbers and manual tasks. */
export function SearchField({ placeholder = "Search tail, WO, ATA, part number" }: { placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((r: SearchEntry[]) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (r: SearchEntry) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  const showList = open && results !== null;
  return (
    <div className="search-box" ref={boxRef}>
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results?.length ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!results?.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>
      {showList && (
        <div className="search-results card" id={listId} role="listbox" aria-label="Search results">
          {results!.length === 0 ? (
            <p className="t-caption">Nothing found for &ldquo;{q.trim()}&rdquo; in tonight&rsquo;s brief.</p>
          ) : (
            results!.map((r, n) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <Link
                  key={r.href + r.label}
                  id={`${listId}-${n}`}
                  href={r.href}
                  role="option"
                  aria-selected={n === active}
                  className="search-hit"
                  onClick={(e) => {
                    e.preventDefault();
                    go(r);
                  }}
                  onMouseEnter={() => setActive(n)}
                >
                  <span className="ico ico-neutral">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="src-text">
                    <span className="t-strong">{r.label}</span>
                    <span className="t-caption">
                      {KIND_LABEL[r.kind]} · {r.detail}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
