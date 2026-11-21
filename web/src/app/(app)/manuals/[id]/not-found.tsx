import { LinkButton } from "@/components/ui";

export default function ManualNotFound() {
  return (
    <div className="empty">
      <h1 className="t-title">This task is not in the manual library yet</h1>
      <p className="muted">Open it from the manual system, or pick a task from the list.</p>
      <LinkButton href="/manuals" kind="secondary">
        All manual tasks
      </LinkButton>
    </div>
  );
}
