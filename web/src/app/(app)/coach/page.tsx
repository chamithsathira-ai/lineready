import { getCoachExercise, getEngineerId, LIVE } from "@/lib/api";
import { Card, Meter, StatusBadge } from "@/components/ui";
import { CoachPractice } from "@/components/CoachPractice";
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
        <CoachPractice exercise={ex} />
        <Card>
          <p className="t-caption">Competency</p>
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
