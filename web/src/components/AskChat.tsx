"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Info, Mic, Send } from "lucide-react";
import type { AskExchange } from "@/lib/types";
import { SourceChip } from "@/components/ui";

type Turn = AskExchange | { question: string; pending: true };

/** Ask: every answer quotes its sources, or says nothing was found. */
export function AskChat({ exchanges, suggestions, initialQuestion }: { exchanges: AskExchange[]; suggestions: string[]; initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>(exchanges);
  const [text, setText] = useState(initialQuestion ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initialQuestion) inputRef.current?.focus();
  }, [initialQuestion]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    setTurns((t) => [...t, { question, pending: true }]);
    setText("");
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };

  return (
    <>
      <div className="chat">
        {turns.map((t, n) => (
          <div key={n} className="col" style={{ gap: 12 }}>
            <p className="chat-q">{t.question}</p>
            {"pending" in t ? (
              <div className="chat-a">
                <p>Nothing found yet. The Ask service is not connected in this build, so no answer is given without sources.</p>
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
                    <SourceChip key={e.id} evidence={e} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a tail, fault or task" aria-label="Question" />
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Ask by voice (coming later)" disabled>
          <Mic size={18} aria-hidden />
        </button>
        <button type="submit" className="btn btn-primary btn-icon" aria-label="Send">
          <Send size={18} aria-hidden />
        </button>
      </form>
      <div className="chips" style={{ marginTop: 16 }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>
    </>
  );
}
