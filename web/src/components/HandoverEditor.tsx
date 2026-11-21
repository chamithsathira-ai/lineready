"use client";

import { useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { Button, Card, StatusBadge } from "@/components/ui";
import { postJSON } from "@/lib/client";

interface Draft {
  summary: { text: string; ids: string[] }[];
  removed: { text: string; reason: string }[];
  aircraft: { reg: string; reviewed: unknown[]; still_open: unknown[]; parts_gaps: string[]; pack_built: boolean }[];
  logbook_checks: number;
  text: string;
  note: string;
  error?: string;
}

/** End-of-shift handover: drafted from tonight's records, edited and saved by the engineer. */
export function HandoverEditor({ engineerId }: { engineerId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await postJSON<Draft>(`/handover/${engineerId}/draft`, {});
      if (d.error) setMsg(d.error);
      else {
        setDraft(d);
        setText(d.text);
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await postJSON<{ audit_hash: string; saved_at: string }>(`/handover/${engineerId}`, { text });
      setMsg(`Saved ${r.saved_at.slice(11, 16)} as the handover for your aircraft. Audit ${r.audit_hash}.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <Card>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button onClick={build} disabled={busy} icon={<Sparkles size={18} aria-hidden />}>
            {draft ? "Redraft from records" : "Draft handover"}
          </Button>
          <span className="grow" />
          {draft && (
            <Button onClick={save} disabled={busy || text.trim().length < 10} icon={<Save size={18} aria-hidden />}>
              Save handover
            </Button>
          )}
        </div>
        {msg && <p className="t-caption" role="status">{msg}</p>}
        {draft ? (
          <>
            <label className="t-label" htmlFor="ho">Handover (edit before saving)</label>
            <textarea id="ho" className="field" style={{ minHeight: 360 }} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="t-caption">{draft.note}</p>
          </>
        ) : (
          <p className="muted">
            Builds the handover from what happened tonight: your reviews and their reasons, logbook entries checked, items still
            open with their deadlines and parts gaps. You edit it and save it; it becomes the next shift&rsquo;s handover.
          </p>
        )}
      </Card>
      {draft && (
        <aside className="col">
          <Card>
            <p className="t-heading">Next shift first</p>
            {draft.summary.length ? (
              draft.summary.map((s, n) => (
                <p key={n}>
                  {s.text} <span className="t-caption">{s.ids.join(", ")}</span>
                </p>
              ))
            ) : (
              <p className="t-caption">No AI summary (nothing urgent, or AI is off). The record list is complete.</p>
            )}
            {!!draft.removed.length && <p className="t-caption">{draft.removed.length} sentence(s) removed by the review layer.</p>}
          </Card>
          <Card>
            {draft.aircraft.map((a) => (
              <div key={a.reg} className="row wrap" style={{ gap: 8 }}>
                <span className="t-data">{a.reg}</span>
                <StatusBadge status={a.still_open.length ? "prep" : "ok"}>{a.still_open.length} open</StatusBadge>
                <span className="t-caption">{a.reviewed.length} reviewed{a.parts_gaps.length ? ` · ${a.parts_gaps.length} parts gap` : ""}</span>
              </div>
            ))}
            <p className="t-caption">Logbook entries checked: {draft.logbook_checks}</p>
          </Card>
        </aside>
      )}
    </div>
  );
}
