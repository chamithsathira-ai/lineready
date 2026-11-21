import { ChevronRight, MessageCircle } from "lucide-react";
import type { BriefItem, ShiftBrief } from "@/lib/types";
import { LinkButton, StatusBadge } from "@/components/ui";
import { timeLeft } from "@/lib/format";

/** The one thing to do first. Replaces the old stat tiles. */
export function NextUpCard({ brief, item }: { brief: ShiftBrief; item: BriefItem }) {
  const a = brief.aircraft.find((x) => x.tail === item.tail);
  const left = a ? timeLeft(brief, a) : null;
  return (
    <section className={`card next next-${item.status}`} aria-label="Next up">
      <div>
        <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
          <StatusBadge status={item.status} />
          <span className="t-data">{item.tail}</span>
          <span className="t-caption">
            {a ? `Stand ${a.stand} · ` : ""}
            {item.source}
          </span>
        </div>
        <p className="t-caption" style={{ marginBottom: 4 }}>
          Next up
        </p>
        <h2 className="t-title">{item.title}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {item.detail}
        </p>
      </div>
      {a && (
        <div className="countdown">
          {left ? (
            <>
              <p className="t-caption">Departs {a.departure}</p>
              <p className="countdown-num">{left}</p>
              <p className="t-caption">left to resolve</p>
            </>
          ) : (
            <p className="t-caption">On ground all night</p>
          )}
        </div>
      )}
      <div className="next-acts">
        <LinkButton href={`/dossier/${item.dossierId ?? item.id}`}>
          Open dossier <ChevronRight size={18} aria-hidden />
        </LinkButton>
        <LinkButton href="/ask" kind="secondary" icon={<MessageCircle size={18} aria-hidden />}>
          Ask about this
        </LinkButton>
        <span className="t-caption">
          {item.evidence.length} sources: {item.evidence.map((e) => e.id).join(", ")}
        </span>
      </div>
    </section>
  );
}
