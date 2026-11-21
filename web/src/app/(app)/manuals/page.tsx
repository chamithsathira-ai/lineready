import { redirect } from "next/navigation";
import { getManualTasks, manualSlug } from "@/lib/api";
import { ManualList } from "@/components/ManualList";

export const dynamic = "force-dynamic";

export default async function ManualsPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  if (task) redirect(`/manuals/${/^(tsm|amm)-/i.test(task) ? task.toLowerCase() : manualSlug(`TSM ${task}`)}`); // old ?task= links
  const tasks = await getManualTasks();
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Manuals</h1>
        <p className="muted">Tasks linked to tonight&rsquo;s aircraft, at their controlled revision.</p>
      </header>
      <ManualList tasks={tasks} />
    </>
  );
}
