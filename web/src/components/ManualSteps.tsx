"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Meter } from "@/components/ui";

/** Step tracking is for the engineer's own progress. It is not a sign-off. */
export function ManualSteps({ steps }: { steps: string[] }) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  const count = done.filter(Boolean).length;
  return (
    <>
      <Meter value={count} total={steps.length} label={`${count} of ${steps.length} steps done`} width={200} />
      <ol className="steps">
        {steps.map((s, n) => (
          <li key={n} className={done[n] ? "done" : undefined}>
            <span className="step-num" aria-hidden>
              {done[n] ? <Check size={20} /> : n + 1}
            </span>
            <p>{s}</p>
            <button
              type="button"
              className="tick"
              aria-pressed={done[n]}
              aria-label={`Mark step ${n + 1} ${done[n] ? "not done" : "done"}`}
              onClick={() => setDone((d) => d.map((v, i) => (i === n ? !v : v)))}
            >
              {done[n] && <Check size={20} aria-hidden />}
            </button>
          </li>
        ))}
      </ol>
      <p className="t-caption">Ticking a step tracks your progress only. It is not a sign-off.</p>
    </>
  );
}
