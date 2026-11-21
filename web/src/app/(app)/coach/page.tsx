import { BookOpen } from "lucide-react";
import { getCoachExercise, getEngineerId, LIVE } from "@/lib/api";
import { Card, Meter, SourceRow, StatusBadge } from "@/components/ui";
import { CoachPanel } from "@/components/coach/CoachPanel";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  if (LIVE) {
    const engineerId = await getEngineerId();
    return (
      <>
        <header className="page-head">
          <StatusBadge status="train">Trainee mode</StatusBadge>
          <h1 className="t-display">Prepare tonight&rsquo;s defects</h1>
          <p className="muted">Real defects from tonight&rsquo;s brief. You do the thinking; LineReady reviews it.</p>
        </header>
        <CoachPanel engineerId={engineerId} />
      </>
    );
  }
  const ex = await getCoachExercise();
  return (
    <>
      <header className="page-head">
        <StatusBadge status="train">Trainee mode</StatusBadge>
        <h1 className="t-display">{ex.title}</h1>
        <p className="muted">{ex.intro}</p>
      </header>
      <div className="grid">
        <Card>
          {ex.feedback.map((f) => (
            <div key={f.label} className="row wrap" style={{ alignItems: "flex-start", gap: 12 }}>
              <StatusBadge status={f.status}>{f.label}</StatusBadge>
              <p className="grow">{f.text}</p>
            </div>
          ))}
          <SourceRow evidence={ex.hint} title="See the fault index rows" href="/manuals" />
        </Card>
        <Card>
          <p className="t-caption row">
            <BookOpen size={16} aria-hidden />
            Competency
          </p>
          <h2 className="t-heading">{ex.competency.name}</h2>
          <p className="t-display">
            {ex.competency.met} of {ex.competency.total}
          </p>
          <Meter value={ex.competency.met} total={ex.competency.total} label="checks met" tone="train" width="100%" />
        </Card>
      </div>
    </>
  );
}
