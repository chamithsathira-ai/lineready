import { getEngineerId, LIVE } from "@/lib/api";
import { LogbookCheck } from "@/components/LogbookCheck";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LogbookPage() {
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Logbook check</h1>
        <p className="muted">Paste a draft entry. LineReady flags what is missing before you sign. You complete and sign the entry.</p>
      </header>
      {LIVE ? <LogbookCheck engineerId={await getEngineerId()} /> : <Card><p>The logbook check needs the backend (set LINEREADY_API_URL).</p></Card>}
    </>
  );
}
