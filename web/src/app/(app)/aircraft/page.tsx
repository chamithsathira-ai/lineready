import Link from "next/link";
import { getEngineerId, getShiftBrief, LIVE } from "@/lib/api";
import { getPackBoard } from "@/lib/packs";
import { StatusBadge } from "@/components/ui";
import { ClockPicker } from "@/components/pack/ClockPicker";

export const dynamic = "force-dynamic";

const hhmm = (iso: string | null) => (iso ? iso.slice(11, 16) : "–");

/** Tonight's aircraft with their pack status. A pack is built automatically 90 minutes before landing. */
export default async function AircraftPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const { at } = await searchParams;
  const [brief, engineerId] = await Promise.all([getShiftBrief(), getEngineerId()]);
  const board = LIVE ? await getPackBoard(engineerId, at) : [];
  const byReg = Object.fromEntries(board.map((b) => [b.reg, b]));
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Aircraft</h1>
        <p className="muted">
          Tonight&rsquo;s aircraft at {brief.station}. Each one gets a pack (items, parts, tools, manual pages, things to clear
          while it is on the ground) 90 minutes before it lands.
        </p>
      </header>
      {LIVE && <ClockPicker current={at} />}
      <div className="tiles">
        {brief.aircraft.map((a) => {
          const n = brief.items.filter((i) => i.tail === a.tail).length;
          const p = byReg[a.tail];
          const href = p?.state === "ready" ? `/pack/${a.tail}` : `/tonight#ac-${a.tail}`;
          return (
            <Link key={a.tail} href={href} className="card tile">
              <div className="row">
                <span className="ac-tail">{a.tail}</span>
                <span className="grow" />
                <StatusBadge status={a.status} />
              </div>
              <p className="t-caption">
                {a.type} · Stand {a.stand} · {a.departure ? `Departs ${a.departure}` : "Night stop"}
              </p>
              <p>
                {n} open {n === 1 ? "item" : "items"}
              </p>
              {p && (
                <p className="t-caption">
                  {p.state === "ready" && <StatusBadge status="ok">Pack ready {hhmm(p.built_at)}</StatusBadge>}
                  {p.state === "due" && <StatusBadge status="prep">Pack building</StatusBadge>}
                  {p.state === "scheduled" && <>Arrives {hhmm(p.arrival)} · pack at {hhmm(p.builds_at)}</>}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
