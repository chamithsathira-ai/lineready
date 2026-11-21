import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, FileText, GraduationCap, Info, ListChecks, OctagonAlert } from "lucide-react";
import type { EvidenceRef, Status } from "@/lib/types";

const STATUS_META: Record<Status, { icon: typeof Info; label: string }> = {
  act: { icon: OctagonAlert, label: "Act before departure" },
  info: { icon: Info, label: "For information" },
  prep: { icon: ListChecks, label: "Prepare" },
  ok: { icon: Check, label: "Ready" },
  train: { icon: GraduationCap, label: "Training" },
};

/** Status is always colour + icon + word, never colour alone. Red (act) means act before departure only. */
export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const { icon: Icon, label } = STATUS_META[status];
  return (
    <span className={`badge badge-${status}`}>
      <Icon size={16} aria-hidden />
      {children ?? label}
    </span>
  );
}

export function StatusIcon({ status, icon: Icon }: { status: Status; icon?: typeof Info }) {
  const I = Icon ?? STATUS_META[status].icon;
  return (
    <span className={`ico badge-${status}`}>
      <I size={22} aria-hidden />
    </span>
  );
}

type ButtonKind = "primary" | "secondary" | "quiet";

export function Button({
  kind = "primary",
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; icon?: ReactNode }) {
  return (
    <button type="button" className={`btn btn-${kind} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, kind = "primary", icon, children }: { href: string; kind?: ButtonKind; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className={`btn btn-${kind}`}>
      {icon}
      {children}
    </Link>
  );
}

export function Card({ children, className = "", style, label }: { children: ReactNode; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <section className={`card ${className}`} style={style} aria-label={label}>
      {children}
    </section>
  );
}

export function CardHead({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <header className="card-head">
      <div>
        {kicker && <p className="t-caption">{kicker}</p>}
        <h2 className="t-heading">{title}</h2>
      </div>
      {right && (
        <>
          <span className="grow" />
          {right}
        </>
      )}
    </header>
  );
}

/** A full-width, 48 px+ source row. Opens the record, manual task or rule it points to. */
export function SourceRow({ evidence, title, href }: { evidence: EvidenceRef; title?: string; href?: string }) {
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
    <button type="button" className="src" aria-label={`Open source ${evidence.id}`}>
      {body}
    </button>
  );
}

export function Meter({ value, total, label, tone = "ok", width }: { value: number; total: number; label: string; tone?: "ok" | "train"; width?: number | string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-bar" style={{ width }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
        <i style={{ width: `${pct}%`, background: tone === "train" ? "var(--train)" : undefined }} />
      </div>
      <span className="t-label">{label}</span>
    </div>
  );
}
