import Link from "next/link";
import { getEngineers, getReadiness, getShiftBrief } from "@/lib/api";
import type { Status } from "@/lib/types";
import { ShiftHeader } from "@/components/shell/ShiftHeader";
import { Card, CardHead, StatusBadge } from "@/components/ui";
import { ReadinessGapsCard } from "@/components/tonight/SideCards";

export const dynamic = "force-dynamic";

const CELL: Partial<Record<Status, string>> = { ok: "Ready", info: "Check", act: "Gap" };

export default async function ReadinessPage() {
  const [brief, rows, engineers] = await Promise.all([getShiftBrief(), getReadiness(), getEngineers()]);
  return (
    <>
      <ShiftHeader brief={brief} title="Readiness before the shift" />
      <div className="grid">
        <Card>
          <CardHead title="Aircraft tonight" />
          <table className="table stack">
            <thead>
              <tr>
                <th>Aircraft</th>
                <th>Departs</th>
                <th>Parts</th>
                <th>Tools</th>
                <th>Manuals</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tail}>
                  <td data-l="Aircraft">
                    <Link href={`/aircraft/${r.tail}`} className="t-data link">
                      {r.tail}
                    </Link>
                  </td>
                  <td data-l="Departs">{r.departure}</td>
                  {(["parts", "tools", "manuals"] as const).map((k) => (
                    <td key={k} data-l={k[0].toUpperCase() + k.slice(1)}>
                      <StatusBadge status={r[k]}>{CELL[r[k]]}</StatusBadge>
                    </td>
                  ))}
                  <td data-l="Note" className="t-caption">
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <aside className="col">
          <ReadinessGapsCard gaps={brief.readinessGaps} sentAt={brief.readinessSentAt} engineers={engineers} actions />
        </aside>
      </div>
    </>
  );
}
