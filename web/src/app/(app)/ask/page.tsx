import { getAskHistory } from "@/lib/api";
import { AskChat } from "@/components/AskChat";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { exchanges, suggestions } = await getAskHistory();
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Ask</h1>
        <p className="muted">Answers come from tonight&rsquo;s aircraft, their history and the controlled manuals. If nothing is found, it says so.</p>
      </header>
      <AskChat exchanges={exchanges} suggestions={suggestions} initialQuestion={q} />
    </>
  );
}
