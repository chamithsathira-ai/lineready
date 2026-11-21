import { LinkButton } from "@/components/ui";

export default function DossierNotFound() {
  return (
    <div className="empty">
      <h1 className="t-title">This dossier is not in tonight&rsquo;s brief</h1>
      <p className="muted">It may belong to an earlier shift or the item was closed.</p>
      <LinkButton href="/tonight" kind="secondary">
        Back to Tonight
      </LinkButton>
    </div>
  );
}
