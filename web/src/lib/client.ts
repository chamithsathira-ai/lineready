// Browser-side calls. /backend/* is proxied to FastAPI by next.config.mjs (same origin, no CORS).
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
  return data as T;
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`/backend${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

/** Where a backend evidence id opens: TSM tasks in the manual viewer, everything else on the Source screen. */
export function sourceHref(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("tsm:") || ref.startsWith("amm:")) return `/manuals?task=${encodeURIComponent(ref.slice(4))}`;
  return `/source?ref=${encodeURIComponent(ref)}`;
}
