"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { useAppState, type ReviewChoice } from "@/components/shell/AppState";

const DONE_TEXT: Record<ReviewChoice, string> = {
  accepted: "Accepted",
  edited: "Edited",
  dismissed: "Marked not relevant",
};

/** Accept / Edit / Not relevant. Review only: there are no sign, defer or release actions in LineReady. */
export function ReviewBar({ itemId }: { itemId: string }) {
  const { reviews, review } = useAppState();
  const done = reviews[itemId];
  return (
    <div className="reviewbar" role="region" aria-label="Your review">
      <div className="reviewbar-text">
        <p className="t-label">{done ? DONE_TEXT[done] : "Your review"}</p>
        <p className="t-caption">{done ? "Logged to the audit trail. You can still change it." : "Accept, edit or mark not relevant. Every choice is logged."}</p>
      </div>
      <span className="grow" />
      <Button kind="secondary" aria-pressed={done === "edited"} onClick={() => review(itemId, "edited")}>
        Edit
      </Button>
      <Button kind="secondary" aria-pressed={done === "dismissed"} onClick={() => review(itemId, "dismissed")}>
        Not relevant
      </Button>
      <Button aria-pressed={done === "accepted"} icon={<Check size={18} aria-hidden />} onClick={() => review(itemId, "accepted")}>
        Accept
      </Button>
    </div>
  );
}
