import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { getManualTask, getReferencedTasks, LIVE } from "@/lib/api";
import { ManualSteps } from "@/components/ManualSteps";
import { Card, SourceRow } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ManualsPage({ searchParams }: { searchParams: Promise<{ task?: string; from?: string }> }) {
  const { task: taskId, from } = await searchParams;

  if (LIVE && !taskId) {
    const tasks = await getReferencedTasks();
    return (
      <>
        <header className="page-head">
          <h1 className="t-display">Manuals</h1>
          <p className="muted">TSM tasks referenced in tonight&rsquo;s brief, at the controlled revision.</p>
        </header>
        <Card style={{ maxWidth: 880 }}>
          {tasks.length ? (
            tasks.map((t) => (
              <SourceRow key={t.id} evidence={{ id: `TSM ${t.id}`, kind: "manual" }} title={`${t.title} · ${t.tail}`}
                href={`/manuals?task=${encodeURIComponent(t.id)}&from=${encodeURIComponent(t.dossier)}`} />
            ))
          ) : (
            <p className="t-caption">No TSM tasks are referenced in tonight&rsquo;s brief.</p>
          )}
        </Card>
      </>
    );
  }

  const task = await getManualTask(taskId, from);
  if (!task) {
    return (
      <Card>
        <p className="t-heading">Task not found in the controlled TSM</p>
        <p className="t-caption">{taskId} is not in the loaded revision. Check the task number.</p>
        <Link href="/manuals" className="btn btn-secondary">All referenced tasks</Link>
      </Card>
    );
  }
  return (
    <>
      <Link href={task.fromDossier ? `/dossier/${task.fromDossier}` : "/manuals"} className="crumb">
        <ChevronLeft size={20} aria-hidden />
        {task.fromDossier ? "Back to dossier" : "Manuals"}
      </Link>
      <header className="page-head">
        <h1 className="t-display">{task.title}</h1>
        <p className="t-caption">
          <span className="t-data">{LIVE ? `${task.doc ?? "TSM"} ${task.id}` : task.id.toUpperCase().replace(/^TSM-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/, "TSM $1-$2-$3-$4-$5")}</span> · Effectivity: {task.effectivity}
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
            <ul>{task.causes.map((c, n) => <li key={n}>{c}</li>)}</ul>
          </Card>
        )}
        {!!task.refs?.length && (
          <Card>
            <h2 className="t-heading">Referenced tasks</h2>
            <ul>
              {task.refs.map((r, n) => (
                <li key={n}>
                  {r.man === "AMM" ? (
                    <Link href={`/manuals?task=${encodeURIComponent(r.ref)}${from ? `&from=${encodeURIComponent(from)}` : ""}`} className="t-data">
                      {r.man} {r.ref}
                    </Link>
                  ) : (
                    <span className="t-data">{r.man} {r.ref}</span>
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
      </div>
    </>
  );
}
