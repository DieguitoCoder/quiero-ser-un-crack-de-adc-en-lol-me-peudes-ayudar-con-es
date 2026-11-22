/**
 * Owner: forge. Refreshes the Supabase session and gates private pages (redirect to /entrar).
 * Edge runtime: no DB or Riot calls. API routes enforce auth themselves via requireViewer().
 */
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/session-middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
