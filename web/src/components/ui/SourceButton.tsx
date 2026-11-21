"use client";

import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import type { EvidenceRef } from "@/lib/types";
import { useOpenSource } from "@/components/shell/SourceSheet";

/** A full-width, 48 px+ source row. Opens the record in the source viewer, or a page when href is given. */
export function SourceRow({ evidence, title, href }: { evidence: EvidenceRef; title?: string; href?: string }) {
  const openSource = useOpenSource();
  const body = (
    <>
      <span className="ico ico-neutral">
        <FileText size={20} aria-hidden />
      </span>
      <span className="src-text">
        <span className="t-data">{evidence.id}</span>
        {title && <span className="t-caption">{title}</span>}
      </span>
      <span className="grow" />
      <ChevronRight size={20} className="muted" aria-hidden />
    </>
  );
  return href ? (
    <Link href={href} className="src">
      {body}
    </Link>
  ) : (
    <button type="button" className="src" aria-label={`Open source ${evidence.id}`} onClick={() => openSource(evidence)}>
      {body}
    </button>
  );
}

/** Compact source chip for inline use (answers, cards). */
export function SourceChip({ evidence }: { evidence: EvidenceRef }) {
  const openSource = useOpenSource();
  return (
    <button type="button" className="chip chip-src" aria-label={`Open source ${evidence.id}`} onClick={() => openSource(evidence)}>
      <FileText size={16} aria-hidden />
      {evidence.id}
    </button>
  );
}
