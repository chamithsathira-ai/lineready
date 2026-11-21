import { getEngineerId, LIVE } from "@/lib/api";
import { HandoverEditor } from "@/components/HandoverEditor";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  return (
    <>
      <header className="page-head">
        <h1 className="t-display">Handover</h1>
        <p className="muted">End of shift: what is still open, what parts are missing, and what the next shift should do first.</p>
      </header>
      {LIVE ? <HandoverEditor engineerId={await getEngineerId()} /> : <Card><p className="t-heading">The handover draft runs on the LineReady backend</p><p className="t-caption">It is not connected in this build. Set LINEREADY_API_URL to switch it on.</p></Card>}
    </>
  );
}
