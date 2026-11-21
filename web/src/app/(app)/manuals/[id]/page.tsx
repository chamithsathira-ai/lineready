import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { getManualTask, LIVE } from "@/lib/api";
import { manualRef, manualSlug } from "@/lib/manuals";
import { ManualSteps } from "@/components/ManualSteps";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ManualTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const task = await getManualTask(id, from);
  if (!task) notFound();
  return (
    <>
      <Link href={task.fromDossier ? `/dossier/${task.fromDossier}` : "/manuals"} className="crumb">
        <ChevronLeft size={20} aria-hidden />
        {task.fromDossier ? "Back to dossier" : "Manuals"}
      </Link>
      <header className="page-head">
        <h1 className="t-display">{task.title}</h1>
        <p className="t-caption">
          <span className="t-data">{manualRef(task.id)}</span> · Effectivity: {task.effectivity}
        </p>
      </header>
      <div className="col" style={{ maxWidth: 880 }}>
        <div className="banner">
          <ShieldCheck size={18} aria-hidden />
          {task.revision}
        </div>
        {!!task.causes?.length && (
          <Card>
            <h2 className="t-heading">Possible causes listed by the TSM</h2>
            <p className="t-caption">To isolate in the order the procedure gives. This is not a diagnosis.</p>
            <ul>
              {task.causes.map((c, n) => (
                <li key={n}>{c}</li>
              ))}
            </ul>
          </Card>
        )}
        {!!task.refs?.length && (
          <Card>
            <h2 className="t-heading">Referenced tasks</h2>
            <ul>
              {task.refs.map((r, n) => (
                <li key={n}>
                  {LIVE && r.man === "AMM" ? (
                    <Link href={`/manuals/${manualSlug(`AMM ${r.ref}`)}${from ? `?from=${encodeURIComponent(from)}` : ""}`} className="t-data link">
                      {r.man} {r.ref}
                    </Link>
                  ) : (
                    <span className="t-data">
                      {r.man} {r.ref}
                    </span>
                  )}{" "}
                  · {r.title}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {!!task.tools?.length && (
          <Card>
            <h2 className="t-heading">Tools and equipment</h2>
            <ul>
              {task.tools.map((t, n) => (
                <li key={n}>
                  {t.pn && <span className="t-data">{t.pn} </span>}
                  {t.name}
                  {t.qty ? ` · qty ${t.qty}` : ""}
                  {t.in_store === true && " · in SHJ tool store"}
                  {t.in_store === false && " · not found in SHJ tool store"}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {!!task.parts?.length && (
          <Card>
            <h2 className="t-heading">Expendable parts (IPC)</h2>
            <ul>
              {task.parts.map((p, n) => (
                <li key={n}>
                  {p.name} · IPC {p.csn}
                  {p.pns?.length ? ` · P/N ${p.pns.join(", ")}` : ""}
                  {p.in_stock === true && " · in station stock"}
                  {p.in_stock === false && " · not in station stock"}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <ManualSteps key={task.id} steps={task.steps} />
        <p className="t-caption">
          {LIVE
            ? `Steps are taken from the controlled ${task.doc ?? "TSM"} text. Follow the task in the manual system when you do the work.`
            : "Step text is shortened sample content. The full controlled task comes from the manual system."}
        </p>
      </div>
    </>
  );
}
