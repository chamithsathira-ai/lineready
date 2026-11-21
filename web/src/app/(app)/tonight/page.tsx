import { getShiftBrief } from "@/lib/api";
import { greeting } from "@/lib/format";
import { ShiftHeader } from "@/components/shell/ShiftHeader";
import { NextUpCard } from "@/components/tonight/NextUpCard";
import { GroundTimeline } from "@/components/tonight/GroundTimeline";
import { AircraftGroups } from "@/components/tonight/AircraftGroups";
import { HandoverCard, ReadinessGapsCard, ResponsibilityNote } from "@/components/tonight/SideCards";

export const dynamic = "force-dynamic";

export default async function TonightPage() {
  const brief = await getShiftBrief();
  const next = brief.items.find((i) => i.pinned) ?? brief.items.find((i) => i.status === "act") ?? brief.items[0];

  return (
    <>
      <ShiftHeader brief={brief} title={greeting(brief)} />
      <div className="grid">
        <div className="col">
          {next && <NextUpCard brief={brief} item={next} />}
          <GroundTimeline brief={brief} />
          <AircraftGroups brief={brief} />
        </div>
        <aside className="col">
          <ReadinessGapsCard gaps={brief.readinessGaps} sentAt={brief.readinessSentAt} />
          <HandoverCard brief={brief} />
          <ResponsibilityNote />
        </aside>
      </div>
    </>
  );
}
