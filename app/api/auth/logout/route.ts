import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await signOut();
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
