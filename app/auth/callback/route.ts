import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, sanitizeNextPath } from "@/lib/auth";
import { getServerEnv } from "@/lib/server-env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { appUrl } = getServerEnv();
  const code = req.nextUrl.searchParams.get("code");
  const next = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  if (code && (await exchangeCode(code))) return NextResponse.redirect(new URL(next, appUrl));
  return NextResponse.redirect(new URL("/entrar?error=AUTH_FAILED", appUrl));
}
