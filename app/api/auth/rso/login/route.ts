import { NextRequest, NextResponse } from "next/server";
import { beginRsoLogin } from "@/lib/auth";
import { handle, jsonError } from "@/lib/api/http";
import { getServerEnv } from "@/lib/server-env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const r = await beginRsoLogin(req.nextUrl.searchParams.get("next") ?? undefined);
    if (!r.ok) return jsonError(r.error);
    const res = NextResponse.redirect(r.data.authorizeUrl);
    res.cookies.set(r.data.cookie.name, r.data.cookie.value, {
      httpOnly: true,
      secure: getServerEnv().nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: r.data.cookie.maxAgeS,
    });
    return res;
  });
}
