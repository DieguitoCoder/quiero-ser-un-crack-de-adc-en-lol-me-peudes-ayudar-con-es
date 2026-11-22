/** Riot Sign-On helpers (pure where possible). Never log tokens or secrets. */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RSO_AUTHORIZE_URL = "https://auth.riotgames.com/authorize";
export const RSO_TOKEN_URL = "https://auth.riotgames.com/token";
export const RSO_ACCOUNT_ME_URL = "https://americas.api.riotgames.com/riot/account/v1/accounts/me";
export const RSO_STATE_COOKIE = "ct_rso";
export const RSO_COOKIE_MAX_AGE_S = 600;

const b64url = (b: Buffer) => b.toString("base64url");

export interface RsoCookiePayload {
  state: string;
  verifier: string;
  next: string;
}

export function newPkce(): { state: string; verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return {
    state: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function encodeRsoCookie(p: RsoCookiePayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

export function decodeRsoCookie(value: string | null): RsoCookiePayload | null {
  if (!value) return null;
  try {
    const o: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof o !== "object" || o === null) return null;
    const r = o as Record<string, unknown>;
    if (typeof r.state !== "string" || typeof r.verifier !== "string" || typeof r.next !== "string") return null;
    return { state: r.state, verifier: r.verifier, next: r.next };
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const syntheticEmail = (puuid: string) => `${puuid.toLowerCase()}@rso.climbtracker.invalid`;
