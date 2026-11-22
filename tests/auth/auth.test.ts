import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieStore.has(n) ? { name: n, value: cookieStore.get(n) } : undefined),
    getAll: () => [],
    set: () => undefined,
  }),
}));

const deleteUserData = vi.fn(async () => ({ journalEntries: 0, profile: true }));
const findUserIdByVerifiedPuuid = vi.fn(async (): Promise<string | null> => null);
const upsertProfile = vi.fn(async () => ({}));
vi.mock("@/lib/db/client", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/lib/db/repos", () => ({
  deleteUserData: (...a: unknown[]) => (deleteUserData as (...x: unknown[]) => unknown)(...a),
  findUserIdByVerifiedPuuid: () => findUserIdByVerifiedPuuid(),
  upsertProfile: (...a: unknown[]) => (upsertProfile as (...x: unknown[]) => unknown)(...a),
  getProfile: async () => null,
}));

const adminDeleteUser = vi.fn(async () => ({ error: null }));
const verifyOtp = vi.fn(async () => ({ error: null }));
const signOutFn = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/auth/supabase", () => ({
  createSessionClient: async () => ({ auth: { verifyOtp, signOut: signOutFn } }),
  createAdminClient: () => ({
    auth: {
      admin: {
        deleteUser: adminDeleteUser,
        createUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null }),
        getUserById: async () => ({ data: { user: { email: "x@rso.climbtracker.invalid" } }, error: null }),
        generateLink: async () => ({ data: { properties: { hashed_token: "hash" } }, error: null }),
      },
    },
  }),
}));

const RSO = {
  RSO_ENABLED: "1",
  RSO_CLIENT_ID: "cid",
  RSO_CLIENT_SECRET: "csecret",
  RSO_REDIRECT_URI: "http://localhost:4200/api/auth/rso/callback",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_MOCK", "0");
  vi.stubEnv("RSO_ENABLED", "0");
  cookieStore.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sanitizeNextPath", () => {
  it("accepts relative paths and rejects open redirects", async () => {
    const { sanitizeNextPath } = await import("@/lib/auth/next-path");
    expect(sanitizeNextPath("/partidas/EUW1_1?x=1")).toBe("/partidas/EUW1_1?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "/%2F%2Fevil.com", "/a\nb", "", null, undefined]) {
      expect(sanitizeNextPath(bad)).toBe("/");
    }
  });
  it("classifies private paths", async () => {
    const { isPrivatePath } = await import("@/lib/auth/next-path");
    expect(isPrivatePath("/")).toBe(true);
    expect(isPrivatePath("/partidas/abc")).toBe(true);
    expect(isPrivatePath("/jugador/x")).toBe(false);
    expect(isPrivatePath("/entrar")).toBe(false);
  });
});

describe("AUTH_MOCK", () => {
  it("returns the fixed mock user outside production", async () => {
    vi.stubEnv("AUTH_MOCK", "1");
    const { getCurrentUser, MOCK_USER_ID } = await import("@/lib/auth");
    expect(await getCurrentUser()).toMatchObject({ id: MOCK_USER_ID, provider: "mock" });
  });
  it("throws in production", async () => {
    vi.stubEnv("AUTH_MOCK", "1");
    vi.stubEnv("NODE_ENV", "production");
    const { getCurrentUser } = await import("@/lib/auth");
    await expect(getCurrentUser()).rejects.toThrow(/AUTH_MOCK/);
  });
});

describe("RSO", () => {
  it("is disabled by default", async () => {
    const { beginRsoLogin } = await import("@/lib/auth");
    const r = await beginRsoLogin();
    expect(r.ok === false && r.error.code).toBe("RSO_DISABLED");
  });

  it("login builds authorize URL with state + PKCE S256 and a cookie carrying them", async () => {
    for (const [k, v] of Object.entries(RSO)) vi.stubEnv(k, v);
    const { beginRsoLogin } = await import("@/lib/auth");
    const { decodeRsoCookie } = await import("@/lib/auth/rso");
    const r = await beginRsoLogin("//evil.com");
    if (!r.ok) throw new Error("expected ok");
    const u = new URL(r.data.authorizeUrl);
    expect(u.origin + u.pathname).toBe("https://auth.riotgames.com/authorize");
    expect(u.searchParams.get("scope")).toBe("openid");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe(RSO.RSO_REDIRECT_URI);
    const c = decodeRsoCookie(r.data.cookie.value);
    expect(c?.state).toBe(u.searchParams.get("state"));
    expect(c?.next).toBe("/");
    expect(r.data.cookie.maxAgeS).toBeLessThanOrEqual(600);
  });

  it("callback rejects missing or mismatched state without calling fetch", async () => {
    for (const [k, v] of Object.entries(RSO)) vi.stubEnv(k, v);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { beginRsoLogin, completeRsoLogin } = await import("@/lib/auth");
    const r = await beginRsoLogin();
    if (!r.ok) throw new Error("expected ok");
    const bad = await completeRsoLogin({ code: "c", state: "wrong", cookieValue: r.data.cookie.value });
    const none = await completeRsoLogin({ code: "c", state: "s", cookieValue: null });
    expect(bad.ok === false && bad.error.code).toBe("RSO_FAILED");
    expect(none.ok === false && none.error.code).toBe("RSO_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callback happy path exchanges code, creates verified profile and a session", async () => {
    for (const [k, v] of Object.entries(RSO)) vi.stubEnv(k, v);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/token")
        ? new Response(JSON.stringify({ access_token: "at" }), { status: 200 })
        : new Response(JSON.stringify({ puuid: "P1", gameName: "Foo", tagLine: "LAN" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { beginRsoLogin, completeRsoLogin } = await import("@/lib/auth");
    const { decodeRsoCookie } = await import("@/lib/auth/rso");
    const r = await beginRsoLogin("/metas");
    if (!r.ok) throw new Error("expected ok");
    const state = decodeRsoCookie(r.data.cookie.value)?.state ?? "";
    const res = await completeRsoLogin({ code: "code", state, cookieValue: r.data.cookie.value });
    expect(res).toEqual({ ok: true, data: { redirectTo: "/metas" } });
    expect(upsertProfile).toHaveBeenCalledWith({}, expect.objectContaining({ puuid: "P1", verified: true }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hash" });
    const tokenCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(tokenCall[1].body)).toContain("code_verifier=");
  });
});

describe("account", () => {
  it("deleteAccount removes app data and the Supabase user", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://sb.local");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "srv");
    const { deleteAccount } = await import("@/lib/auth");
    const r = await deleteAccount("u1");
    expect(r.ok).toBe(true);
    expect(deleteUserData).toHaveBeenCalledWith({}, "u1");
    expect(adminDeleteUser).toHaveBeenCalledWith("u1");
  });
});

describe("PUT /api/me/riot-id", () => {
  it("propagates RIOT_ID_TAKEN as 409 and validates input", async () => {
    vi.stubEnv("AUTH_MOCK", "1");
    vi.doMock("@/lib/services/v2", () => ({
      linkRiotId: async () => ({ ok: false, error: { code: "RIOT_ID_TAKEN", message: "x" } }),
    }));
    const { PUT } = await import("@/app/api/me/riot-id/route");
    const { NextRequest } = await import("next/server");
    const mk = (b: unknown) =>
      new NextRequest("http://localhost/api/me/riot-id", { method: "PUT", body: JSON.stringify(b) });
    expect((await PUT(mk({ riotId: "Foo#LAN" }))).status).toBe(409);
    expect((await PUT(mk({ riotId: "nohash" }))).status).toBe(422);
  });
});
