import { getAskHistory, getEngineerId, LIVE } from "@/lib/api";
import { AskChat } from "@/components/AskChat";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ exchanges, suggestions }, engineerId, { q }] = await Promise.all([getAskHistory(), getEngineerId(), searchParams]);
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Ask</h1>
        <p className="muted">Answers come from tonight&rsquo;s aircraft, their history and the controlled manuals. If nothing is found, it says so.</p>
      </header>
      <AskChat exchanges={exchanges} suggestions={suggestions} live={LIVE} engineerId={engineerId} initialQuestion={q} />
    </>
  );
}
