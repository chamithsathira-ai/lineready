"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { useAppState, type ReviewChoice } from "@/components/shell/AppState";
import { postJSON } from "@/lib/client";

const DONE_TEXT: Record<ReviewChoice, string> = {
  accepted: "Accepted",
  edited: "Edited",
  dismissed: "Marked not relevant",
};
const ACTION: Record<ReviewChoice, "accept" | "edit" | "dismiss"> = { accepted: "accept", edited: "edit", dismissed: "dismiss" };

const PROMPT: Record<"edited" | "dismissed", { label: string; placeholder: string }> = {
  edited: { label: "What did you change or add?", placeholder: "For example: MCC confirmed the extension to 22 Nov, ref MCC-2231." },
  dismissed: { label: "Why is it not relevant?", placeholder: "For example: closed by day shift, WO 6185240." },
};

/**
 * Accept / Edit / Not relevant. Review only: there are no sign, defer or release actions in LineReady.
 * With a live brief every choice is written to the backend audit trail (Edit and Not relevant need a reason);
 * without one the choice is kept in this browser.
 */
export function ReviewBar({ itemId, briefId, engineerId }: { itemId: string; briefId?: number; engineerId?: string }) {
  const { reviews, review } = useAppState();
  const done = reviews[itemId];
  const live = Boolean(briefId && engineerId);
  const [mode, setMode] = useState<"edited" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode) areaRef.current?.focus();
  }, [mode]);

  const needsNote = (m: "edited" | "dismissed") => m === "edited" || live;

  async function commit(choice: ReviewChoice, why?: string) {
    if (!live) {
      review(itemId, choice, why);
      setMode(null);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJSON<{ audit_hash: string }>("/feedback", {
        engineer_id: engineerId,
        brief_id: briefId,
        item_id: itemId,
        action: ACTION[choice],
        reason: why ?? "",
        edited_text: choice === "edited" ? (why ?? "") : "",
      });
      review(itemId, choice, why);
      setMode(null);
      setMsg(`Logged to the audit trail (${r.audit_hash}).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const startNote = (m: "edited" | "dismissed") => {
    setNote(done?.choice === m ? (done.note ?? "") : "");
    setMsg(null);
    setMode(m);
  };
  const save = () => {
    if (!mode) return;
    if (needsNote(mode) && !note.trim()) return;
    commit(mode, note.trim() || undefined);
  };

  return (
    <div className="reviewbar" role="region" aria-label="Your review">
      {mode ? (
        <form
          className="review-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="t-label" htmlFor={`note-${itemId}`}>
            {PROMPT[mode].label}
            {!needsNote(mode) && " (optional)"}
          </label>
          <textarea
            id={`note-${itemId}`}
            ref={areaRef}
            className="input"
            rows={3}
            value={note}
            maxLength={500}
            placeholder={PROMPT[mode].placeholder}
            onChange={(e) => setNote(e.target.value)}
          />
          {msg && <p className="t-caption">{msg}</p>}
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            <Button kind="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (needsNote(mode) && !note.trim())}>
              {mode === "edited" ? "Save edit" : "Mark not relevant"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="reviewbar-text">
            <p className="t-label">{done ? `${DONE_TEXT[done.choice]} at ${done.at}` : "Your review"}</p>
            <p className="t-caption">
              {msg ??
                (done?.note
                  ? `“${done.note}”`
                  : done
                    ? "Logged to the audit trail. You can still change it."
                    : "Accept, edit or mark not relevant. Every choice is logged.")}
            </p>
          </div>
          <span className="grow" />
          <Button kind="secondary" aria-pressed={done?.choice === "edited"} onClick={() => startNote("edited")} disabled={busy}>
            Edit
          </Button>
          <Button kind="secondary" aria-pressed={done?.choice === "dismissed"} onClick={() => startNote("dismissed")} disabled={busy}>
            Not relevant
          </Button>
          <Button aria-pressed={done?.choice === "accepted"} icon={<Check size={18} aria-hidden />} onClick={() => commit("accepted")} disabled={busy}>
            Accept
          </Button>
        </>
      )}
    </div>
  );
}
