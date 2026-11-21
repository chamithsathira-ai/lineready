import { LinkButton } from "@/components/ui";

export default function AircraftNotFound() {
  return (
    <div className="empty">
      <h1 className="t-title">This aircraft is not on tonight&rsquo;s shift</h1>
      <p className="muted">Check the registration, or look at the aircraft list.</p>
      <LinkButton href="/aircraft" kind="secondary">
        All aircraft
      </LinkButton>
    </div>
  );
}
