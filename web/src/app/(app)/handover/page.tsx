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
      {LIVE ? <HandoverEditor engineerId={await getEngineerId()} /> : <Card><p>The handover needs the backend (set LINEREADY_API_URL).</p></Card>}
    </>
  );
}
