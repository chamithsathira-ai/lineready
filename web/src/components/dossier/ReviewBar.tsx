"use client";

import { useState } from "react";
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

/**
 * Accept / Edit / Not relevant. Review only: there are no sign, defer or release actions in LineReady.
 * With a live brief every choice is written to the backend audit trail; Edit and Not relevant need a reason.
 */
export function ReviewBar({ itemId, briefId, engineerId }: { itemId: string; briefId?: number; engineerId?: string }) {
  const { reviews, review } = useAppState();
  const done = reviews[itemId];
  const [pending, setPending] = useState<ReviewChoice | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function commit(choice: ReviewChoice, why = "") {
    if (!briefId || !engineerId) {
      review(itemId, choice); // demo mode: browser only
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJSON<{ audit_hash: string }>("/feedback", {
        engineer_id: engineerId, brief_id: briefId, item_id: itemId, action: ACTION[choice], reason: why,
        edited_text: choice === "edited" ? why : "",
      });
      review(itemId, choice);
      setPending(null);
      setReason("");
      setMsg(`Logged to the audit trail (${r.audit_hash}).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ask = (choice: ReviewChoice) => {
    setPending(choice);
    setMsg(null);
  };

  return (
    <div className="reviewbar" role="region" aria-label="Your review">
      <div className="reviewbar-text">
        <p className="t-label">{done ? DONE_TEXT[done] : "Your review"}</p>
        <p className="t-caption">
          {msg ?? (done ? "Logged to the audit trail. You can still change it." : "Accept, edit or mark not relevant. Every choice is logged.")}
        </p>
      </div>
      <span className="grow" />
      {pending ? (
        <form
          className="row wrap"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) commit(pending, reason.trim());
          }}
        >
          <input
            className="review-reason"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={pending === "edited" ? "What did you change, and why?" : "Why is it not relevant?"}
            aria-label="Reason"
          />
          <Button kind="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <button type="submit" className="btn btn-primary" disabled={!reason.trim() || busy}>
            Save
          </button>
        </form>
      ) : (
        <>
          <Button kind="secondary" aria-pressed={done === "edited"} onClick={() => ask("edited")} disabled={busy}>
            Edit
          </Button>
          <Button kind="secondary" aria-pressed={done === "dismissed"} onClick={() => ask("dismissed")} disabled={busy}>
            Not relevant
          </Button>
          <Button aria-pressed={done === "accepted"} icon={<Check size={18} aria-hidden />} onClick={() => commit("accepted")} disabled={busy}>
            Accept
          </Button>
        </>
      )}
    </div>
  );
}
