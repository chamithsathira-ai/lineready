import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { getManualTask } from "@/lib/api";
import { manualRef } from "@/lib/manuals";
import { ManualSteps } from "@/components/ManualSteps";

export default async function ManualTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getManualTask(id);
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
        <ManualSteps key={task.id} steps={task.steps} />
        <p className="t-caption">Step text is shortened sample content. The full controlled task comes from the manual system.</p>
      </div>
    </>
  );
}
