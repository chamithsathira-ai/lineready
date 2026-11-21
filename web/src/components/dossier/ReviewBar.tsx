"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { useAppState, type ReviewChoice } from "@/components/shell/AppState";

const DONE_TEXT: Record<ReviewChoice, string> = {
  accepted: "Accepted",
  edited: "Edited",
  dismissed: "Marked not relevant",
};

const PROMPT: Record<"edited" | "dismissed", { label: string; placeholder: string; required: boolean }> = {
  edited: { label: "What did you change or add?", placeholder: "For example: MCC confirmed the extension to 22 Nov, ref MCC-2231.", required: true },
  dismissed: { label: "Why is it not relevant? (optional)", placeholder: "For example: closed by day shift, WO 6185240.", required: false },
};

/** Accept / Edit / Not relevant. Review only: there are no sign, defer or release actions in LineReady. */
export function ReviewBar({ itemId }: { itemId: string }) {
  const { reviews, review } = useAppState();
  const done = reviews[itemId];
  const [mode, setMode] = useState<"edited" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode) areaRef.current?.focus();
  }, [mode]);

  const startNote = (m: "edited" | "dismissed") => {
    setNote(done?.choice === m ? (done.note ?? "") : "");
    setMode(m);
  };
  const save = () => {
    if (!mode) return;
    if (PROMPT[mode].required && !note.trim()) return;
    review(itemId, mode, note.trim() || undefined);
    setMode(null);
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
          </label>
          <textarea
            id={`note-${itemId}`}
            ref={areaRef}
            className="input"
            rows={3}
            value={note}
            placeholder={PROMPT[mode].placeholder}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            <Button kind="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={PROMPT[mode].required && !note.trim()}>
              {mode === "edited" ? "Save edit" : "Mark not relevant"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="reviewbar-text">
            <p className="t-label">{done ? `${DONE_TEXT[done.choice]} at ${done.at}` : "Your review"}</p>
            <p className="t-caption">
              {done?.note ? `“${done.note}”` : done ? "Logged to the audit trail. You can still change it." : "Accept, edit or mark not relevant. Every choice is logged."}
            </p>
          </div>
          <span className="grow" />
          <Button kind="secondary" aria-pressed={done?.choice === "edited"} onClick={() => startNote("edited")}>
            Edit
          </Button>
          <Button kind="secondary" aria-pressed={done?.choice === "dismissed"} onClick={() => startNote("dismissed")}>
            Not relevant
          </Button>
          <Button aria-pressed={done?.choice === "accepted"} icon={<Check size={18} aria-hidden />} onClick={() => review(itemId, "accepted")}>
            Accept
          </Button>
        </>
      )}
    </div>
  );
}
