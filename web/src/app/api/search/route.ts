import { NextResponse } from "next/server";
import { search } from "@/lib/api";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await search(q));
}
