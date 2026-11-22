/**
 * v2 server configuration. Owner: orion (contract); forge may harden validation.
 * The ONLY reader of v2 secrets (SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, RIOT_API_KEY, RSO_CLIENT_SECRET).
 * Values are never logged or returned. lib/env.ts (v1) is removed by cobalt once services move to v2.
 */
import "server-only";

export interface ServerEnv {
  nodeEnv: string;
  /** canonical public origin, no trailing slash (e.g. https://climb.example.com) */
  appUrl: string;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseServiceRoleKey: string | null;
  /** pooled (Supavisor transaction mode, port 6543) connection string; null → PGlite (dev/test) */
  databaseUrl: string | null;
  riotApiKey: string | null;
  /** default platform for new profiles / search (e.g. "la1") */
  riotPlatform: string;
  /** regional routing for account-v1 and match-v5 (e.g. "americas") */
  riotRegion: string;
  riotMock: boolean;
  authMock: boolean;
  rso: { enabled: false } | { enabled: true; clientId: string; clientSecret: string; redirectUri: string };
}

export class EnvError extends Error {
  override name = "EnvError";
}

function str(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Throws EnvError on unsafe/invalid combos (AUTH_MOCK in production, RSO enabled without credentials). */
export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const nodeEnv = env.NODE_ENV ?? "development";
  const authMock = env.AUTH_MOCK?.trim() === "1";
  if (authMock && nodeEnv === "production") {
    throw new EnvError("AUTH_MOCK=1 is forbidden when NODE_ENV=production");
  }
  let rso: ServerEnv["rso"] = { enabled: false };
  if (env.RSO_ENABLED?.trim() === "1") {
    const clientId = str(env.RSO_CLIENT_ID);
    const clientSecret = str(env.RSO_CLIENT_SECRET);
    const redirectUri = str(env.RSO_REDIRECT_URI);
    if (!clientId || !clientSecret || !redirectUri) {
      throw new EnvError("RSO_ENABLED=1 requires RSO_CLIENT_ID, RSO_CLIENT_SECRET and RSO_REDIRECT_URI");
    }
    rso = { enabled: true, clientId, clientSecret, redirectUri };
  }
  return {
    nodeEnv,
    appUrl: (str(env.APP_URL) ?? "http://localhost:4200").replace(/\/+$/, ""),
    supabaseUrl: str(env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: str(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: str(env.SUPABASE_SERVICE_ROLE_KEY),
    databaseUrl: str(env.DATABASE_URL),
    riotApiKey: str(env.RIOT_API_KEY),
    riotPlatform: str(env.RIOT_PLATFORM) ?? "la1",
    riotRegion: str(env.RIOT_REGION) ?? "americas",
    riotMock: env.RIOT_MOCK?.trim() === "1",
    authMock,
    rso,
  };
}
