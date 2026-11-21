import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PackageCheck, Wrench } from "lucide-react";
import { getPack } from "@/lib/packs";
import { slug } from "@/lib/backend";
import { Card, CardHead, SourceRow, StatusBadge } from "@/components/ui";
import { evRef } from "@/lib/backend";

export const dynamic = "force-dynamic";
const hhmm = (iso: string | null) => (iso ? iso.slice(11, 16) : "–");

export default async function PackPage({ params }: { params: Promise<{ reg: string }> }) {
  const { reg } = await params;
  const p = await getPack(decodeURIComponent(reg));
  if (!p) notFound();
  return (
    <>
      <Link href={`/aircraft/${p.reg}`} className="crumb">
        <ChevronLeft size={20} aria-hidden />
        {p.reg}
      </Link>
      <header className="page-head">
        <StatusBadge status="ok">Pack ready {hhmm(p.built_at)} · {p.trigger}</StatusBadge>
        <h1 className="t-display">{p.reg} pack</h1>
        <p className="t-caption">
          Arrives {hhmm(p.arrival)} · departs {hhmm(p.departure)} ({p.flight_out}) · stand {p.stand} · {p.ground_minutes} min on ground
          {p.aircraft && ` · MSN ${p.aircraft.msn} · ${p.aircraft.model} · ${p.aircraft.engine}`}
        </p>
      </header>
      <div className="grid">
        <div className="col">
          <Card>
            <CardHead title="Items for this turnaround" />
            {p.items.length ? p.items.map((d) => (
              <Link key={d.item_id} href={`/dossier/${slug(d.item_id)}`} className="item">
                <span>
                  <span className="t-strong">{d.title.replace(/^ENG ENTRY:\s*/i, "")}</span>
                  <span className="item-meta">
                    {d.flags.map((f) => (
                      <span key={f.rule_id + f.title} className={`t-label c-${f.severity === "critical" ? "act" : "info"}`}>{f.rule_id}</span>
                    ))}
                  </span>
                </span>
              </Link>
            )) : <p className="t-caption">Nothing flagged on this aircraft.</p>}
          </Card>
          <Card>
            <CardHead title="Could be cleared while on the ground" kicker="Suggestions only: you decide what to work" />
            {p.clear_now.length ? p.clear_now.map((c) => (
              <div key={c.wo} className="gap">
                <div className="row wrap"><span className="t-data">WO {c.wo}</span><span className="t-caption">{c.type} · ATA {c.ata} · open since {c.opened}</span></div>
                <p className="t-strong">{c.text}</p>
                <p className="t-caption">{c.why} · {c.deferral}{c.parts.length ? ` · parts: ${c.parts.map((x) => `${x.pn} ${x.in_stock ? "in stock" : "not in stock"}`).join(", ")}` : ""}</p>
                <SourceRow evidence={evRef(`wo:${c.wo}`)} />
              </div>
            )) : <p className="t-caption">No minor open items found for this aircraft.</p>}
          </Card>
          <Card>
            <CardHead title="Last 7 days on this aircraft" />
            {p.history.length ? p.history.map((h) => (
              <p key={h.wo_number} className="t-caption"><span className="t-data">{h.date_opened}</span> · {h.wo_type} {h.wo_number} · ATA {h.ata} · {h.state} · {h.description}</p>
            )) : <p className="t-caption">No pilot or maintenance reports in the last 7 days.</p>}
          </Card>
        </div>
        <aside className="col">
          <Card>
            <CardHead title="Manual pages" kicker="Controlled TSM / AMM, TSN 86" />
            {p.manual_pages.map((m) => <SourceRow key={m.ref} evidence={evRef(m.ref)} title={m.label.split(" · ")[1]} />)}
          </Card>
          <Card>
            <p className="t-heading row"><PackageCheck size={18} aria-hidden /> Parts</p>
            {p.parts.length ? p.parts.map((x, n) => <p key={n} className={`t-caption${x.kind === "information_only" ? "" : " t-strong"}`}>{x.text}</p>) : <p className="t-caption">No parts identified.</p>}
            <p className="t-heading row"><Wrench size={18} aria-hidden /> Tools</p>
            {p.tools.length ? p.tools.map((x, n) => <p key={n} className="t-caption">{x.text}</p>) : <p className="t-caption">No numbered tools identified.</p>}
            {!!p.gaps.length && <StatusBadge status="act">{p.gaps.length} gap(s) sent to shift lead</StatusBadge>}
          </Card>
        </aside>
      </div>
    </>
  );
}
