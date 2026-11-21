import { NextResponse } from "next/server";
import { getSource } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getSource(decodeURIComponent(id));
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(record);
}
