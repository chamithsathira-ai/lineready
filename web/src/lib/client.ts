// Browser-side calls. /backend/* is proxied to FastAPI at runtime by app/backend/[...path]/route.ts (same origin, no CORS).
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

/** Where a backend evidence id opens as a page: TSM and AMM tasks open in the manual viewer. Other records open in the source sheet. */
export function sourceHref(ref?: string): string | undefined {
  const m = ref?.match(/^(tsm|amm):(.+)$/);
  return m ? `/manuals/${m[1]}-${m[2].toLowerCase()}` : undefined;
}
