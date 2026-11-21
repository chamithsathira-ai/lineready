"use client";

import { useState } from "react";
import type { CoachExercise } from "@/lib/types";
import { Button, Card, SourceRow, StatusBadge } from "@/components/ui";

const QUESTIONS = [
  { id: "history", label: "Which history matters, and why?" },
  { id: "task", label: "Which TSM task would you open?" },
  { id: "parts", label: "Which parts and tools do you need ready?" },
];

/** The trainee writes their own preparation first; feedback is shown only after they compare. */
export function CoachPractice({ exercise }: { exercise: CoachExercise }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [compared, setCompared] = useState(false);
  const filled = QUESTIONS.filter((q) => answers[q.id]?.trim()).length;

  return (
    <Card>
      {QUESTIONS.map((q) => (
        <label key={q.id} className="col" style={{ gap: 6 }}>
          <span className="t-label">{q.label}</span>
          <textarea
            className="input"
            rows={3}
            value={answers[q.id] ?? ""}
            readOnly={compared}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          />
        </label>
      ))}
      {!compared ? (
        <div className="row wrap">
          <Button disabled={filled < QUESTIONS.length} onClick={() => setCompared(true)}>
            Compare with the answer key
          </Button>
          <span className="t-caption">
            {filled} of {QUESTIONS.length} answered
          </span>
        </div>
      ) : (
        <>
          <h2 className="t-heading">Feedback</h2>
          {exercise.feedback.map((f) => (
            <div key={f.label} className="row wrap" style={{ alignItems: "flex-start", gap: 12 }}>
              <StatusBadge status={f.status}>{f.label}</StatusBadge>
              <p className="grow">{f.text}</p>
            </div>
          ))}
          <SourceRow evidence={exercise.hint} title="Open the fault index rows" />
          <p className="t-caption">Feedback in this build is sample content. The Coach agent will grade your answers against the hidden dossier.</p>
          <div>
            <Button
              kind="secondary"
              onClick={() => {
                setCompared(false);
                setAnswers({});
              }}
            >
              Try again
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
