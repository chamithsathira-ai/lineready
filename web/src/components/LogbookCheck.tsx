"use client";

import { useState } from "react";
import Link from "next/link";
import { FileCheck } from "lucide-react";
import { Button, Card, StatusBadge } from "@/components/ui";
import { postJSON, sourceHref } from "@/lib/client";

interface Finding { rule_id: string; rule: string; ok: boolean | null; detail: string; manual_page: string | null }
interface Result {
  gaps: number;
  findings: Finding[];
  deep_check: { missing: { item: string; from_outline: string }[] } | null;
  note: string;
}

const SAMPLE = "BRAKES HOT ON ARRIVAL. CARRIED OUT TROUBLESHOOTING IAW TSM 32-42-00-810-921-A. REPLACED BRAKE ASSY WHEEL 2.";

/** Checks a draft entry before the engineer signs. It never completes or signs the entry. */
export function LogbookCheck({ engineerId }: { engineerId: string }) {
  const [entry, setEntry] = useState(SAMPLE);
  const [wo, setWo] = useState("");
  const [deep, setDeep] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setErr(null);
    try {
      setResult(await postJSON<Result>("/logbook/check", { engineer_id: engineerId, entry, wo_number: wo || null, deep }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <Card>
        <label className="t-label" htmlFor="lb">Draft entry</label>
        <textarea id="lb" className="field" value={entry} onChange={(e) => setEntry(e.target.value)} />
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="field" style={{ maxWidth: 220 }} value={wo} onChange={(e) => setWo(e.target.value)} placeholder="WO number (optional)" aria-label="WO number" />
          <label className="t-caption row" style={{ gap: 6 }}>
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            AI deep check against the TSM task (uses tokens)
          </label>
          <span className="grow" />
          <Button onClick={check} disabled={busy || entry.trim().length < 5} icon={<FileCheck size={18} aria-hidden />}>
            {busy ? "Checking…" : "Check entry"}
          </Button>
        </div>
        {err && <p className="c-act">{err}</p>}
      </Card>
      <aside className="col">
        {result ? (
          <Card>
            <StatusBadge status={result.gaps ? "act" : "ok"}>{result.gaps ? `${result.gaps} gap(s) to fix before signing` : "No gaps found"}</StatusBadge>
            {result.findings.map((f, n) => (
              <div key={n} className="row wrap" style={{ alignItems: "flex-start", gap: 10 }}>
                <StatusBadge status={f.ok === true ? "ok" : f.ok === false ? "act" : "info"}>{f.rule_id}</StatusBadge>
                <div className="grow">
                  <p className="t-strong">{f.rule}</p>
                  <p className="t-caption">{f.detail}</p>
                  {f.manual_page && sourceHref(f.manual_page) && (
                    <Link className="chip" href={sourceHref(f.manual_page)!}>Open {f.manual_page.replace("tsm:", "TSM ")}</Link>
                  )}
                </div>
              </div>
            ))}
            {!!result.deep_check?.missing?.length && (
              <>
                <h3 className="t-label">AI deep check against the TSM outline</h3>
                <ul>{result.deep_check.missing.map((m, n) => <li key={n}>{m.item} <span className="t-caption">“{m.from_outline}”</span></li>)}</ul>
              </>
            )}
            <p className="t-caption">{result.note}</p>
          </Card>
        ) : (
          <Card>
            <p className="t-heading">Before you sign</p>
            <p className="t-caption">Checks the manual task is cited and exists in the controlled TSM, the revision, part and serial numbers, tool calibration and the test result. Each finding names its rule.</p>
          </Card>
        )}
      </aside>
    </div>
  );
}
