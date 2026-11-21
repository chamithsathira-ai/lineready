"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Info, Mic, Send } from "lucide-react";
import type { AskExchange, EvidenceRef } from "@/lib/types";
import { SourceChip } from "@/components/ui";
import { postJSON } from "@/lib/client";

type Turn = AskExchange | { question: string; pending: true } | { question: string; error: string };

interface AskResponse {
  answer: string;
  citations: string[];
  found: boolean;
  session_id: string;
  tools_used?: string[];
  removed_citations?: string[];
}

const LABEL: Record<string, string> = { wo: "WO", tsm: "TSM", pha: "PHA", stock: "Stores", tool: "Tool", rule: "Rule", aviatar: "AVIATAR" };
const toRef = (c: string): EvidenceRef => {
  const [p, ...rest] = c.split(":");
  const tail = p === "aviatar" ? rest.slice(1).join(":") : rest.join(":");
  return { id: `${LABEL[p] ?? p} ${tail}`, ref: c };
};

/** Ask: every answer quotes its sources, or says nothing was found. */
export function AskChat({
  exchanges, suggestions, live, engineerId, initialQuestion,
}: { exchanges: AskExchange[]; suggestions: string[]; live?: boolean; engineerId?: string; initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>(exchanges);
  const [text, setText] = useState(live ? "" : (initialQuestion ?? ""));
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    if (!live) {
      setTurns((t) => [...t, { question, error: "Nothing found yet. The Ask service is not connected in this build, so no answer is given without sources." }]);
      return;
    }
    setTurns((t) => [...t, { question, pending: true }]);
    setBusy(true);
    try {
      const r = await postJSON<AskResponse>("/ask", { engineer_id: engineerId ?? "E1", question, session_id: session });
      setSession(r.session_id);
      const caution = [
        r.found ? "Found in the controlled data." : "Not found, or only partly found, in the controlled data.",
        r.removed_citations?.length ? `${r.removed_citations.length} unsupported citation(s) were removed.` : "",
        "Information to support your decision, not an instruction.",
      ].filter(Boolean).join(" ");
      setTurns((t) => [...t.slice(0, -1), { question, answer: r.answer, caution, evidence: r.citations.map(toRef) }]);
    } catch (e) {
      setTurns((t) => [...t.slice(0, -1), { question, error: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialQuestion || asked.current) return;
    asked.current = true;
    if (live) ask(initialQuestion);
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };

  return (
    <>
      <div className="chat" aria-live="polite">
        {turns.map((t, n) => (
          <div key={n} className="col" style={{ gap: 12 }}>
            <p className="chat-q">{t.question}</p>
            {"pending" in t ? (
              <div className="chat-a">
                <p className="t-caption">Looking it up in the manuals and records…</p>
              </div>
            ) : "error" in t ? (
              <div className="chat-a">
                <p>{t.error}</p>
              </div>
            ) : (
              <div className="chat-a">
                <p>{t.answer}</p>
                <p className="t-caption row" style={{ alignItems: "flex-start" }}>
                  <Info size={18} className="c-info" aria-hidden style={{ flex: "none" }} />
                  {t.caution}
                </p>
                <div className="row wrap">
                  {t.evidence.map((e) => (
                    <SourceChip key={e.ref ?? e.id} evidence={e} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a tail, fault or task" aria-label="Question" disabled={busy} />
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Ask by voice (coming later)" disabled>
          <Mic size={18} aria-hidden />
        </button>
        <button type="submit" className="btn btn-primary btn-icon" aria-label="Send" disabled={busy}>
          <Send size={18} aria-hidden />
        </button>
      </form>
      <div className="chips" style={{ marginTop: 16 }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}
