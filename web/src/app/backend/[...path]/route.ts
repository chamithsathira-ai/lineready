// Runtime proxy: browser -> /backend/* -> ${LINEREADY_API_URL}/api/*.
// Read at request time (not build time), so one image works in compose, staging and production.
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const API = () => process.env.LINEREADY_API_URL || "http://localhost:8000";

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${API()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { "Content-Type": req.headers.get("content-type") ?? "application/json" },
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();
  try {
    const res = await fetch(target, init);
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

export { forward as GET, forward as POST };
