import { NextRequest, NextResponse } from "next/server";
import { RSO_STATE_COOKIE, completeRsoLogin } from "@/lib/auth";
import { jsonError } from "@/lib/api/http";
import { getServerEnv } from "@/lib/server-env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { appUrl } = getServerEnv();
  const sp = req.nextUrl.searchParams;
  const r = await completeRsoLogin({
    code: sp.get("code") ?? "",
    state: sp.get("state") ?? "",
    cookieValue: req.cookies.get(RSO_STATE_COOKIE)?.value ?? null,
  }).catch(() => null);
  if (r && !r.ok && r.error.code === "RSO_DISABLED") return jsonError(r.error);
  const res = NextResponse.redirect(new URL(r?.ok ? r.data.redirectTo : "/entrar?error=RSO_FAILED", appUrl));
  res.cookies.delete(RSO_STATE_COOKIE);
  return res;
}
