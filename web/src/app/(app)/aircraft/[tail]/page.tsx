import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PackageCheck } from "lucide-react";
import { getDossiers, getEngineerId, getShiftBrief, LIVE } from "@/lib/api";
import { getPackBoard } from "@/lib/packs";
import { timeLeft } from "@/lib/format";
import { Card, CardHead, LinkButton, StatusBadge } from "@/components/ui";
import { ItemRow } from "@/components/tonight/ItemRow";
import { ReadinessGapsCard } from "@/components/tonight/ReadinessGapsCard";

export const dynamic = "force-dynamic";

export default async function AircraftDetailPage({ params }: { params: Promise<{ tail: string }> }) {
  const { tail } = await params;
  const [brief, dossiers] = await Promise.all([getShiftBrief(), getDossiers()]);
  const a = brief.aircraft.find((x) => x.tail.toLowerCase() === decodeURIComponent(tail).toLowerCase());
  if (!a) notFound();
  const items = brief.items.filter((i) => i.tail === a.tail);
  const gaps = brief.readinessGaps.filter((g) => g.tail === a.tail);
  const history = dossiers.flatMap((d) => d.history).filter((h) => h.tail === a.tail);
  const parts = dossiers.filter((d) => items.some((i) => i.dossierId === d.id)).flatMap((d) => d.parts);
  const left = timeLeft(brief, a);
  const pack = LIVE ? (await getPackBoard(await getEngineerId())).find((p) => p.reg === a.tail) : undefined;

  return (
    <>
      <Link href="/aircraft" className="crumb">
        <ChevronLeft size={20} aria-hidden />
        Aircraft
      </Link>
      <header className="page-head">
        <div className="row wrap" style={{ gap: 12 }}>
          <h1 className="t-display t-mono-display">{a.tail}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="muted">
          {a.type} · Stand {a.stand} · {a.departure ? `Departs ${a.departure} · in ${left}` : "Night stop, on ground all night"}
        </p>
        {pack?.state === "ready" && (
          <div className="row wrap">
            <LinkButton href={`/pack/${a.tail}`} icon={<PackageCheck size={18} aria-hidden />}>
              Open aircraft pack
            </LinkButton>
          </div>
        )}
      </header>
      <div className="grid">
        <div className="col">
          <section className="card ac" aria-label="Open items">
            <header className="ac-head">
              <h2 className="t-heading">Open items tonight</h2>
            </header>
            {items.length ? items.map((i) => <ItemRow key={i.id} item={i} />) : <p className="item t-caption">No open items for this aircraft tonight.</p>}
          </section>
          <Card>
            <CardHead title="Recent history" kicker="Information only" />
            {history.length ? (
              <table className="table stack">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action taken</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.date + h.action}>
                      <td data-l="Date">{h.date}</td>
                      <td data-l="Action">{h.action}</td>
                      <td data-l="Outcome">
                        <span className={`badge ${h.recurred ? "badge-act" : "badge-ok"}`}>{h.outcome}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="t-caption">No related reports on this tail in the last 90 days.</p>
            )}
          </Card>
        </div>
        <aside className="col">
          {gaps.length > 0 && <ReadinessGapsCard gaps={gaps} sentAt={brief.readinessSentAt} />}
          <Card>
            <CardHead title="Parts and tools" />
            {parts.length ? (
              parts.map((p) => (
                <div key={p.ref} className="row wrap" style={{ justifyContent: "space-between" }}>
                  <span>
                    <span className="t-strong">{p.item}</span>
                    <br />
                    <span className="t-caption">
                      <span className="t-data">{p.ref}</span> · {p.stock}
                    </span>
                  </span>
                  <StatusBadge status={p.status}>{p.statusLabel}</StatusBadge>
                </div>
              ))
            ) : (
              <p className="t-caption">No parts or tools flagged.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
