import type { ShiftBrief, Status } from "@/lib/types";
import { nowClock } from "@/lib/format";

const BAR: Record<Status, string> = { act: "var(--act)", info: "var(--info)", prep: "var(--ink-600)", ok: "var(--ok)", train: "var(--train)" };
const BAR_LABEL: Partial<Record<Status, string>> = { act: "Act", info: "Info" };

/** Tonight's aircraft on one time axis. Tapping a tail jumps to its group in the list. */
export function GroundTimeline({ brief }: { brief: ShiftBrief }) {
  const pct = (m: number) => (Math.max(0, Math.min(brief.shiftMinutes, m)) / brief.shiftMinutes) * 100;
  const hours = Array.from({ length: Math.floor(brief.shiftMinutes / 120) + 1 }, (_, i) => String((brief.shiftStartHour + i * 2) % 24).padStart(2, "0"));
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="t-heading">Tonight on the ground</h2>
        <span className="grow" />
        <span className="t-caption">Now {nowClock(brief)}</span>
      </header>
      <div className="tl-row" aria-hidden>
        <span />
        <div className="tl-scale">
          {hours.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      </div>
      {brief.aircraft.map((a) => (
        <a key={a.tail} href={`#ac-${a.tail}`} className="tl-row tl-link" aria-label={`${a.tail}, ${a.departure ? `departs ${a.departure}` : "night stop"}. Show items.`}>
          <span>
            <span className="t-data">{a.tail}</span>
            <br />
            <span className="t-caption">{a.departure ?? "Night stop"}</span>
          </span>
          <span className="tl-track">
            <span className="tl-bar" style={{ left: `${pct(a.arriveMin)}%`, width: `${pct(a.departMin) - pct(a.arriveMin)}%`, background: BAR[a.status] }}>
              {BAR_LABEL[a.status]}
            </span>
            <span className="tl-now" style={{ left: `${pct(brief.nowMin)}%` }} />
          </span>
        </a>
      ))}
    </section>
  );
}
