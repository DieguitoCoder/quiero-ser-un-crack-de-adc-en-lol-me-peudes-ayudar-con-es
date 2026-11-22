/**
 * Auth module (v2). Owner: forge. Server-only.
 * Supabase Auth (magic link, @supabase/ssr cookies) is the session authority. RSO (Riot Sign-On)
 * is an extra login path behind RSO_ENABLED=1 that ends in a normal Supabase session.
 * AUTH_MOCK=1 (dev/test only; getServerEnv throws in production) returns a fixed user from cookie
 * `ct_mock_user` (uuid) or MOCK_USER_ID.
 *
 * Route handlers and pages call ONLY `getViewer` / `requireViewer`.
 */
import "server-only";
import { cookies } from "next/headers";
import { apiError } from "@/lib/errors";
import { getServerEnv } from "@/lib/server-env";
import type { ApiErrorCode, AuthUser, ServiceResult, Viewer } from "@/lib/types";
import { getAppDb } from "@/lib/db/client";
import { deleteUserData, findUserIdByVerifiedPuuid, getProfile, upsertProfile } from "@/lib/db/repos";
import { createAdminClient, createSessionClient } from "./supabase";
import { sanitizeNextPath } from "./next-path";
import {
  RSO_ACCOUNT_ME_URL,
  RSO_AUTHORIZE_URL,
  RSO_COOKIE_MAX_AGE_S,
  RSO_STATE_COOKIE,
  RSO_TOKEN_URL,
  decodeRsoCookie,
  encodeRsoCookie,
  newPkce,
  safeEqual,
  syntheticEmail,
} from "./rso";

export { RSO_ACCOUNT_ME_URL, RSO_AUTHORIZE_URL, RSO_STATE_COOKIE, RSO_TOKEN_URL };
export { sanitizeNextPath } from "./next-path";

export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_USER_COOKIE = "ct_mock_user";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = <T>(code: ApiErrorCode, extra?: { retryAfterS?: number }): ServiceResult<T> => ({
  ok: false,
  error: apiError(code, extra),
});

/** Current session user, or null. Never throws for "no session". Uses getUser() (verified), never getSession(). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const env = getServerEnv(); // throws EnvError for AUTH_MOCK=1 in production
  if (env.authMock) {
    const c = (await cookies()).get(MOCK_USER_COOKIE)?.value;
    const fromEnv = process.env.MOCK_USER_ID?.trim();
    const id = c && UUID_RE.test(c) ? c : fromEnv && UUID_RE.test(fromEnv) ? fromEnv : MOCK_USER_ID;
    return { id, email: "mock@climbtracker.local", provider: "mock" };
  }
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const email = data.user.email ?? null;
    const provider = email?.endsWith("@rso.climbtracker.invalid") ? "rso" : "magic_link";
    return { id: data.user.id, email, provider };
  } catch {
    return null;
  }
}

/** User + linked profile, or null when signed out. */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getProfile(await getAppDb(), user.id);
  return { user, profile };
}

/** UNAUTHENTICATED when signed out. Does NOT require a profile (services return PROFILE_REQUIRED). */
export async function requireViewer(): Promise<ServiceResult<Viewer>> {
  const viewer = await getViewer();
  return viewer ? { ok: true, data: viewer } : fail("UNAUTHENTICATED");
}

/** POST /api/auth/magic-link use case. `next` is sanitized to a same-origin relative path. */
export async function sendMagicLink(email: string, next?: string): Promise<ServiceResult<{ sent: true }>> {
  const env = getServerEnv();
  if (env.authMock) return { ok: true, data: { sent: true } };
  try {
    const supabase = await createSessionClient();
    const redirect = `${env.appUrl}/auth/callback?next=${encodeURIComponent(sanitizeNextPath(next))}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) {
      console.error("[auth] magic link failed:", error.status ?? "unknown");
      return fail(error.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR");
    }
    return { ok: true, data: { sent: true } };
  } catch {
    return fail("INTERNAL_ERROR");
  }
}

/** Exchanges a PKCE code for a session (cookies set by the Supabase SSR client). */
export async function exchangeCode(code: string): Promise<boolean> {
  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  if (getServerEnv().authMock) return;
  try {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  } catch {
    // nothing to sign out
  }
}

/* ---------- RSO (RSO_ENABLED=1) ---------- */

/** Builds the authorize URL (scope "openid", state + PKCE S256) and the httpOnly cookie payload to set. */
export async function beginRsoLogin(next?: string): Promise<
  ServiceResult<{ authorizeUrl: string; cookie: { name: string; value: string; maxAgeS: number } }>
> {
  const { rso } = getServerEnv();
  if (!rso.enabled) return fail("RSO_DISABLED");
  const pkce = newPkce();
  const url = new URL(RSO_AUTHORIZE_URL);
  url.searchParams.set("client_id", rso.clientId);
  url.searchParams.set("redirect_uri", rso.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", pkce.state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return {
    ok: true,
    data: {
      authorizeUrl: url.toString(),
      cookie: {
        name: RSO_STATE_COOKIE,
        value: encodeRsoCookie({ state: pkce.state, verifier: pkce.verifier, next: sanitizeNextPath(next) }),
        maxAgeS: RSO_COOKIE_MAX_AGE_S,
      },
    },
  };
}

interface RsoAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

async function fetchRsoAccount(
  code: string,
  verifier: string,
  rso: { clientId: string; clientSecret: string; redirectUri: string },
): Promise<RsoAccount | null> {
  const basic = Buffer.from(`${rso.clientId}:${rso.clientSecret}`).toString("base64");
  const tokenRes = await fetch(RSO_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: rso.redirectUri,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: unknown };
  if (typeof tokens.access_token !== "string") return null;
  const meRes = await fetch(RSO_ACCOUNT_ME_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  if (!meRes.ok) return null;
  const me = (await meRes.json()) as { puuid?: unknown; gameName?: unknown; tagLine?: unknown };
  if (typeof me.puuid !== "string" || typeof me.gameName !== "string" || typeof me.tagLine !== "string") return null;
  return { puuid: me.puuid, gameName: me.gameName, tagLine: me.tagLine };
}

/**
 * Validates state, exchanges code (+ code_verifier) at the token endpoint, calls accounts/me,
 * finds-or-creates the Supabase user, upserts profile verified=true, establishes the session.
 * Returns the relative path to redirect to.
 */
export async function completeRsoLogin(params: { code: string; state: string; cookieValue: string | null }): Promise<
  ServiceResult<{ redirectTo: string }>
> {
  const { rso, riotPlatform } = getServerEnv();
  if (!rso.enabled) return fail("RSO_DISABLED");
  const saved = decodeRsoCookie(params.cookieValue);
  if (!saved || !params.code || !params.state || !safeEqual(saved.state, params.state)) return fail("RSO_FAILED");
  try {
    const account = await fetchRsoAccount(params.code, saved.verifier, rso);
    if (!account) return fail("RSO_FAILED");

    const db = await getAppDb();
    const admin = createAdminClient();
    let userId = await findUserIdByVerifiedPuuid(db, account.puuid);
    let email: string;
    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user?.email) return fail("RSO_FAILED");
      email = data.user.email;
    } else {
      email = syntheticEmail(account.puuid);
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error || !data.user) return fail("RSO_FAILED");
      userId = data.user.id;
    }
    await upsertProfile(db, {
      userId,
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: riotPlatform,
      verified: true,
      now: Date.now(),
    });

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return fail("RSO_FAILED");
    const supabase = await createSessionClient();
    const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (otpError) return fail("RSO_FAILED");
    return { ok: true, data: { redirectTo: sanitizeNextPath(saved.next) } };
  } catch {
    return fail("RSO_FAILED");
  }
}

/** DELETE /api/me: quartz `deleteUserData` then Supabase admin `deleteUser`, then sign out. */
export async function deleteAccount(userId: string): Promise<ServiceResult<{ deleted: true }>> {
  try {
    await deleteUserData(await getAppDb(), userId);
    if (!getServerEnv().authMock) {
      const { error } = await createAdminClient().auth.admin.deleteUser(userId);
      if (error) return fail("INTERNAL_ERROR");
    }
    await signOut();
    return { ok: true, data: { deleted: true } };
  } catch {
    return fail("INTERNAL_ERROR");
  }
}
