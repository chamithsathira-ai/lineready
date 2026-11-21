import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { getManualTask } from "@/lib/api";
import { ManualSteps } from "@/components/ManualSteps";

export default async function ManualsPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task: taskId } = await searchParams;
  const task = await getManualTask(taskId);
  return (
    <>
      {task.fromDossier && (
        <Link href={`/dossier/${task.fromDossier}`} className="crumb">
          <ChevronLeft size={20} aria-hidden />
          Back to dossier
        </Link>
      )}
      <header className="page-head">
        <h1 className="t-display">{task.title}</h1>
        <p className="t-caption">
          <span className="t-data">{task.id.toUpperCase().replace(/^TSM-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/, "TSM $1-$2-$3-$4-$5")}</span> · Effectivity: {task.effectivity}
        </p>
      </header>
      <div className="col" style={{ maxWidth: 880 }}>
        <div className="banner">
          <ShieldCheck size={18} aria-hidden />
          {task.revision}
        </div>
        <ManualSteps steps={task.steps} />
      </div>
    </>
  );
}
