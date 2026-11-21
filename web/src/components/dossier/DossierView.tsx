"use client";

import { useState } from "react";
import { BookOpen, Check } from "lucide-react";
import type { BriefItem, Dossier } from "@/lib/types";
import { Card, CardHead, LinkButton, SourceRow, StatusBadge } from "@/components/ui";
import { ReviewBar } from "./ReviewBar";

type Tab = "summary" | "history" | "refs" | "parts";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "history", label: "History" },
  { id: "refs", label: "References" },
  { id: "parts", label: "Parts and tools" },
];

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <p className="t-heading">{text}</p>
      <p className="t-caption">If you expected something here, ask about it or check the source records.</p>
    </Card>
  );
}

export function DossierView({ dossier, item, briefId, engineerId }: { dossier: Dossier; item: BriefItem; briefId?: number; engineerId?: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  const manualHref = dossier.manualTaskId
    ? `/manuals?task=${encodeURIComponent(dossier.manualTaskId)}&from=${encodeURIComponent(dossier.id)}`
    : undefined;

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Dossier sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="grid">
          <Card>
            <h2 className="t-heading">What is happening</h2>
            <p>{dossier.summary}</p>
            {dossier.summarySource && (
              <p className="t-caption">
                {dossier.summarySource === "llm_verified"
                  ? "Summary written by AI and checked sentence by sentence against the sources."
                  : "Summary built from the records by rules (no AI)."}
              </p>
            )}
            {!!dossier.removed?.length && (
              <details>
                <summary className="t-caption">{dossier.removed.length} sentence(s) removed by the review layer</summary>
                {dossier.removed.map((r, n) => (
                  <p key={n} className="t-caption">
                    <span className="removed">{r.text}</span> · {r.gate}: {r.reason}
                  </p>
                ))}
              </details>
            )}
            <h3 className="t-label" style={{ marginTop: 8 }}>
              Timeline
            </h3>
            <ul className="tline">
              {dossier.timeline.map((e, n) => (
                <li key={n} className={e.hot ? "hot" : undefined}>
                  <p className="t-label">{e.when}</p>
                  <p className="t-caption">{e.text}</p>
                </li>
              ))}
            </ul>
          </Card>
          <aside className="col">
            <Card>
              <h2 className="t-heading">Suggested next step</h2>
              <p>{dossier.nextStep}</p>
              {manualHref && (
                <div>
                  <LinkButton href={manualHref} icon={<BookOpen size={18} aria-hidden />}>
                    Open TSM task
                  </LinkButton>
                </div>
              )}
            </Card>
            <Card>
              <h2 className="t-heading">Sources</h2>
              <div className="col" style={{ gap: 8 }}>
                {item.evidence.map((e) => (
                  <SourceRow key={e.id} evidence={e} />
                ))}
              </div>
            </Card>
          </aside>
        </div>
      )}

      {tab === "history" &&
        (dossier.history.length ? (
          <Card>
            <p className="t-caption">Earlier reports on this tail and fleet. Information only.</p>
            <table className="table stack">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tail</th>
                  <th>Action taken</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {dossier.history.map((h, n) => (
                  <tr key={n}>
                    <td data-l="Date">{h.date}</td>
                    <td data-l="Tail" className="t-data">
                      {h.tail}
                    </td>
                    <td data-l="Action">{h.action}</td>
                    <td data-l="Outcome">
                      <span className={`badge ${h.recurred ? "badge-act" : "badge-ok"}`}>{h.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Empty text="No similar reports on this tail in the last 90 days" />
        ))}

      {tab === "refs" &&
        (dossier.references.length ? (
          <Card>
            {dossier.revision && (
              <div className="banner">
                <Check size={18} aria-hidden />
                Controlled source · {dossier.revision}
              </div>
            )}
            {dossier.references.map((r) => (
              <SourceRow
                key={r.id}
                evidence={{ id: r.id, kind: "manual" }}
                title={r.title}
                href={/^(TSM|AMM) /.test(r.id) ? `/manuals?task=${encodeURIComponent(r.id.slice(4))}&from=${encodeURIComponent(dossier.id)}` : undefined}
              />
            ))}
          </Card>
        ) : (
          <Empty text="No manual references for this item" />
        ))}

      {tab === "parts" &&
        (dossier.parts.length ? (
          <Card>
            <table className="table stack">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Part or tool</th>
                  <th>SHJ stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dossier.parts.map((p, n) => (
                  <tr key={n}>
                    <td data-l="Item">{p.item}</td>
                    <td data-l="Part" className="t-data">
                      {p.ref}
                    </td>
                    <td data-l="Stock">{p.stock}</td>
                    <td data-l="Status">
                      <StatusBadge status={p.status}>{p.statusLabel}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Empty text="No parts or tools flagged for this item" />
        ))}

      <ReviewBar itemId={item.id} briefId={briefId} engineerId={engineerId} />
    </>
  );
}
