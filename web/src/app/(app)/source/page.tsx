import Link from "next/link";
import { ChevronLeft, ShieldCheck, Info } from "lucide-react";
import { getSource } from "@/lib/api";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Any evidence chip opens here: the AMOS work order, or the record exactly as held in tonight's brief. */
export default async function SourcePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const src = ref ? await getSource(ref) : undefined;
  return (
    <>
      <Link href="/tonight" className="crumb">
        <ChevronLeft size={20} aria-hidden />
        Tonight
      </Link>
      {!src ? (
        <Card>
          <p className="t-heading">Source not found</p>
          <p className="t-caption">{ref ? `No record for ${ref} in tonight's brief.` : "No source selected."}</p>
        </Card>
      ) : (
        <>
          <header className="page-head">
            <h1 className="t-display">{src.label}</h1>
            <p className="t-caption">{src.meta}</p>
          </header>
          <div className="col" style={{ maxWidth: 880 }}>
            <div className="banner">
              {src.approved ? <ShieldCheck size={18} aria-hidden /> : <Info size={18} aria-hidden />}
              {src.source} · {src.approved ? "system of record / controlled source" : "information only"}
            </div>
            <Card>
              {src.body.map((line, n) => <p key={n} className="t-data" style={{ whiteSpace: "pre-wrap" }}>{line}</p>)}
              {src.url && <a className="btn btn-secondary" href={src.url} target="_blank" rel="noopener noreferrer">Open in AVIATAR</a>}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
