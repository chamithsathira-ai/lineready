import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDossier, getManualTasks, getShiftBrief } from "@/lib/api";
import { CATEGORY_LABEL } from "@/lib/format";
import { StatusBadge } from "@/components/ui";
import { DossierView } from "@/components/dossier/DossierView";

export const dynamic = "force-dynamic";

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dossier, brief, tasks] = await Promise.all([getDossier(id), getShiftBrief(), getManualTasks()]);
  const item = brief.items.find((i) => i.dossierId === id || i.id === id);
  if (!dossier || !item) notFound();
  const a = brief.aircraft.find((x) => x.tail === item.tail);

  return (
    <>
      <Link href="/tonight" className="crumb">
        <ChevronLeft size={20} aria-hidden />
        Tonight
      </Link>
      <header className="page-head">
        <div className="row wrap" style={{ gap: 10 }}>
          <StatusBadge status={item.status} />
          <span className="t-label muted">{CATEGORY_LABEL[item.category]}</span>
        </div>
        <h1 className="t-display">{item.title}</h1>
        <p className="t-caption">
          <Link href={`/aircraft/${item.tail}`} className="t-data link">{item.tail}</Link>
          {a && ` · ${a.type} · Stand ${a.stand} · ${a.departure ? `Departs ${a.departure}` : "Night stop"}`} · Dossier {dossier.version}, verified
        </p>
      </header>
      <DossierView dossier={dossier} item={item} manualIds={tasks.map((t) => t.id)} />
    </>
  );
}
