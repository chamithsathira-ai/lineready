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
      {LIVE ? <LogbookCheck engineerId={await getEngineerId()} /> : <Card><p className="t-heading">The logbook check runs on the LineReady backend</p><p className="t-caption">It is not connected in this build. Set LINEREADY_API_URL to switch it on.</p></Card>}
    </>
  );
}
