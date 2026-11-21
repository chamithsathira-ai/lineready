"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button, Card, Meter, StatusBadge } from "@/components/ui";
import { getJSON, postJSON } from "@/lib/client";
import type { Status } from "@/lib/types";

interface Exercise { brief_id: number; item_id: string; reg: string; ata: string | null; title: string; symptom: string[] }
interface Result {
  score: { tsm_task: string; history_records_found: string; parts_found: string; flags_noticed: string; points: number };
  feedback: { well_done: string; questions: string[]; look_at: string[] };
  answer_key: { tasks: string[] } | null;
  error?: string;
}

const MAX_POINTS = 10;
const tone = (v: string): Status => (v === "correct" ? "ok" : v === "right chapter" ? "info" : v.startsWith("0 of") || v === "not yet" ? "act" : "info");

/** The trainee prepares the defect; the agent reviews against the verified dossier, without giving the answer away. */
export function CoachPanel({ engineerId }: { engineerId: string }) {
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [pick, setPick] = useState(0);
  const [trainee, setTrainee] = useState("Trainee T1");
  const [tsm, setTsm] = useState("");
  const [history, setHistory] = useState("");
  const [parts, setParts] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getJSON<Exercise[]>(`/coach/exercises/${engineerId}`).then(setExercises).catch((e) => setErr(e.message));
  }, [engineerId]);

  const ex = exercises?.[pick];
  const submit = async () => {
    if (!ex) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJSON<Result>("/coach/submit", { trainee, engineer_id: engineerId, item_id: ex.item_id, tsm_task: tsm, history_notes: history, parts });
      if (r.error) setErr(r.error);
      else setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !exercises) return <Card><p>{err}</p></Card>;
  if (!exercises) return <Card><p className="t-caption">Loading exercises…</p></Card>;
  if (!ex) return <Card><p className="t-heading">No exercises yet</p><p className="t-caption">Exercises come from tonight&rsquo;s verified dossiers. Build a brief first.</p></Card>;

  return (
    <div className="grid">
      <Card>
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="t-caption" htmlFor="ex">Defect</label>
          <select id="ex" className="field" style={{ maxWidth: 520 }} value={pick} onChange={(e) => { setPick(Number(e.target.value)); setResult(null); }}>
            {exercises.map((e, n) => <option key={e.item_id} value={n}>{e.reg} · {e.title.slice(0, 70)}</option>)}
          </select>
        </div>
        <h2 className="t-heading">{ex.reg} · ATA {ex.ata ?? "–"}</h2>
        {ex.symptom.map((s, n) => <p key={n} className="muted">{s}</p>)}
        <label className="t-label" htmlFor="c1">1. Which TSM task would you start with?</label>
        <input id="c1" className="field" value={tsm} onChange={(e) => setTsm(e.target.value)} placeholder="e.g. 34-52-00-810-8xx-A" />
        <label className="t-label" htmlFor="c2">2. What history matters? WO numbers, repetitive, deadline?</label>
        <textarea id="c2" className="field" value={history} onChange={(e) => setHistory(e.target.value)} />
        <label className="t-label" htmlFor="c3">3. Which parts or tools will you need? (P/N)</label>
        <input id="c3" className="field" value={parts} onChange={(e) => setParts(e.target.value)} />
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="t-caption" htmlFor="tr">Trainee</label>
          <input id="tr" className="field" style={{ maxWidth: 220 }} value={trainee} onChange={(e) => setTrainee(e.target.value)} />
          <span className="grow" />
          <Button onClick={submit} disabled={busy}>{busy ? "Reviewing…" : "Submit for review"}</Button>
        </div>
        {err && <p className="c-act">{err}</p>}
      </Card>
      <aside className="col">
        {result ? (
          <>
            <Card>
              <div className="row wrap" style={{ gap: 8 }}>
                <StatusBadge status={tone(result.score.tsm_task)}>TSM task: {result.score.tsm_task}</StatusBadge>
                <StatusBadge status={tone(result.score.history_records_found)}>History {result.score.history_records_found}</StatusBadge>
                <StatusBadge status={tone(result.score.flags_noticed)}>Flags {result.score.flags_noticed}</StatusBadge>
                <StatusBadge status="info">Parts {result.score.parts_found}</StatusBadge>
              </div>
              <p>{result.feedback.well_done}</p>
              <h3 className="t-label">Think about</h3>
              <ul>{result.feedback.questions.map((q, n) => <li key={n}>{q}</li>)}</ul>
              <p className="t-caption row"><BookOpen size={16} aria-hidden /> Look at: {result.feedback.look_at.join(" · ")}</p>
              <p className="t-caption">
                {result.answer_key ? `Answer key unlocked: TSM ${result.answer_key.tasks.join(", ")}` : "The answer key unlocks once your TSM task is right."}
              </p>
            </Card>
            <Card>
              <p className="t-caption">This attempt</p>
              <p className="t-display">{result.score.points} of {MAX_POINTS}</p>
              <Meter value={Math.min(result.score.points, MAX_POINTS)} total={MAX_POINTS} label="preparation checks met" tone="train" width="100%" />
            </Card>
          </>
        ) : (
          <Card>
            <p className="t-heading">How this works</p>
            <p className="t-caption">You prepare the defect as you would for a senior engineer. LineReady compares it with the verified dossier, asks guiding questions and points to the manual. It does not hand you the answer.</p>
          </Card>
        )}
      </aside>
    </div>
  );
}
