import Link from "next/link";
import { getShiftBrief } from "@/lib/api";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AircraftPage() {
  const brief = await getShiftBrief();
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Aircraft</h1>
        <p className="muted">Tonight&rsquo;s aircraft at {brief.station}. Open one to see its items.</p>
      </header>
      <div className="tiles">
        {brief.aircraft.map((a) => {
          const n = brief.items.filter((i) => i.tail === a.tail).length;
          return (
            <Link key={a.tail} href={`/tonight#ac-${a.tail}`} className="card tile">
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
            </Link>
          );
        })}
      </div>
    </>
  );
}
