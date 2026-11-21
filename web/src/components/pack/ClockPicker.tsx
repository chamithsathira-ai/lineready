"use client";

import { useRouter } from "next/navigation";

const TIMES = ["21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00"];

/** Demo control: replay the night at a chosen station time to watch packs appear before each landing. */
export function ClockPicker({ current }: { current?: string }) {
  const router = useRouter();
  const cur = current?.slice(11, 16) ?? "21:00";
  const iso = (t: string) => `${Number(t.slice(0, 2)) < 12 ? "2026-11-21" : "2026-11-20"}T${t}:00`;
  return (
    <div className="chips" role="group" aria-label="Station clock (demo replay)">
      <span className="t-caption">Station clock (replay):</span>
      {TIMES.map((t) => (
        <button key={t} type="button" className="chip" aria-pressed={cur === t} onClick={() => router.push(`/aircraft?at=${iso(t)}`)}>
          {t}
        </button>
      ))}
    </div>
  );
}
