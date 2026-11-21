"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Info, Mic, MicOff, Send, Volume2 } from "lucide-react";
import type { AskExchange, EvidenceRef } from "@/lib/types";
import { postJSON, sourceHref } from "@/lib/client";

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

// Browser speech recognition (Chrome/Edge/Safari). Not in TypeScript's DOM lib, so typed minimally here.
interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
}
function speechRecognition(): SpeechRec | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}
function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    /* no speech synthesis in this browser */
  }
}

/** Ask: every answer quotes its sources, or says nothing was found. Questions can be typed or spoken. */
export function AskChat({
  exchanges, suggestions, live, engineerId, initialQuestion,
}: { exchanges: AskExchange[]; suggestions: string[]; live?: boolean; engineerId?: string; initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>(exchanges);
  const [text, setText] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);
  const rec = useRef<SpeechRec | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);

  useEffect(() => {
    setVoiceOk(Boolean(speechRecognition()));
  }, []);

  const toggleVoice = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = speechRecognition();
    if (!r) return;
    let finalText = "";
    r.lang = "en-GB";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setText((finalText + interim).trim());
    };
    r.onerror = (e) => setVoiceMsg(e.error === "not-allowed" ? "Microphone permission was refused." : `Voice input stopped (${e.error}).`);
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) ask(finalText);
    };
    rec.current = r;
    setVoiceMsg(null);
    setListening(true);
    r.start();
  };

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    if (!live) {
      setTurns((t) => [...t, { question, error: "The Ask service is not connected in this build, so no answer is given without sources." }]);
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
    if (initialQuestion && !asked.current) {
      asked.current = true;
      ask(initialQuestion);
    }
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
                <button type="button" className="btn btn-quiet" onClick={() => speak(t.answer)} aria-label="Read the answer aloud">
                  <Volume2 size={18} aria-hidden /> Read aloud
                </button>
                <p className="t-caption row" style={{ alignItems: "flex-start" }}>
                  <Info size={18} className="c-info" aria-hidden style={{ flex: "none" }} />
                  {t.caution}
                </p>
                <div className="row wrap">
                  {t.evidence.map((e) => {
                    const href = sourceHref(e.ref);
                    return href ? (
                      <Link key={e.id} href={href} className="chip">
                        {e.id}
                      </Link>
                    ) : (
                      <span key={e.id} className="chip">
                        {e.id}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a tail, fault or task" aria-label="Question" disabled={busy} />
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          aria-label={listening ? "Stop listening" : "Ask by voice"}
          aria-pressed={listening}
          disabled={!voiceOk || !live || busy}
          title={voiceOk ? "Ask by voice" : "Voice input is not supported in this browser"}
          onClick={toggleVoice}
        >
          {listening ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
        </button>
        <button type="submit" className="btn btn-primary btn-icon" aria-label="Send" disabled={busy}>
          <Send size={18} aria-hidden />
        </button>
      </form>
      {(listening || voiceMsg) && (
        <p className="t-caption" role="status" style={{ marginTop: 8 }}>
          {listening ? "Listening… speak your question, it is sent when you stop." : voiceMsg}
        </p>
      )}
      <p className="t-caption" style={{ marginTop: 8 }}>
        Voice uses the browser&rsquo;s speech recognition (in Chrome this is processed by Google). For hangar use, switch to an on-premise speech model.
      </p>
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
