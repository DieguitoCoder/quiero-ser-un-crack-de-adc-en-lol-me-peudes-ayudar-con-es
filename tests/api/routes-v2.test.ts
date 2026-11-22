/**
 * Owner: cobalt. v2 route handlers: auth (mocked lib/auth), PGlite (createTestDb), RIOT_MOCK=1 fixtures.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb, seedProfile } from "@/tests/db/helpers";
import type { Db } from "@/lib/db/types";
import { apiError } from "@/lib/errors";
import type { Profile, ServiceResult, Viewer } from "@/lib/types";

const KEY = "RGAPI-route-secret-0000-must-never-leak";
const PUUID = "mock-puuid-xdieguinho-9250-0000000000000000000000000000000000000000";
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

const state: { db: Db | null; viewer: ServiceResult<Viewer> } = {
  db: null,
  viewer: { ok: false, error: apiError("UNAUTHENTICATED") },
};

vi.mock("@/lib/db/client", () => ({
  getAppDb: async () => {
    if (!state.db) throw new Error("db not ready");
    return state.db;
  },
}));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => state.viewer }));

function profile(userId: string, puuid: string | null): Profile {
  return { userId, puuid, gameName: "xDieguinho", tagLine: "9250", platform: "la1", verified: false, createdAt: 1, updatedAt: 1 };
}
function signIn(userId: string, puuid: string | null = PUUID) {
  state.viewer = { ok: true, data: { user: { id: userId, email: null, provider: "mock" }, profile: profile(userId, puuid) } };
}
const get = (url: string) => new NextRequest(`http://x${url}`);
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const json = (body: unknown) => ({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function syncAll() {
  const { POST } = await import("@/app/api/sync/route");
  let cursor: string | null = null;
  const texts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await POST(new Request("http://x/api/sync", { method: "POST", body: JSON.stringify({ cursor }) }));
    const text = await res.text();
    texts.push(text);
    expect(res.status).toBe(200);
    const body = JSON.parse(text) as { hasMore: boolean; cursor: string | null };
    if (!body.hasMore) break;
    cursor = body.cursor;
  }
  return texts;
}

beforeAll(async () => {
  process.env.RIOT_MOCK = "1";
  process.env.RIOT_API_KEY = KEY;
  state.db = await createTestDb();
  await seedProfile(state.db, USER_A, PUUID);
  await seedProfile(state.db, USER_B, PUUID);
  signIn(USER_A);
  await syncAll();
});

afterAll(() => {
  delete process.env.RIOT_MOCK;
  delete process.env.RIOT_API_KEY;
});

beforeEach(() => signIn(USER_A));

describe("auth", () => {
  it("private routes return 401 UNAUTHENTICATED (Spanish) when signed out", async () => {
    state.viewer = { ok: false, error: apiError("UNAUTHENTICATED") };
    const routes = [
      (await import("@/app/api/matches/route")).GET(get("/api/matches")),
      (await import("@/app/api/stats/route")).GET(get("/api/stats")),
      (await import("@/app/api/goals/route")).GET(get("/api/goals")),
      (await import("@/app/api/sync/route")).POST(new Request("http://x/api/sync", { method: "POST" })),
      (await import("@/app/api/matches/[id]/route")).GET(get("/"), ctx({ id: "LA1_1500000100" })),
      (await import("@/app/api/journal/[matchId]/route")).GET(get("/"), ctx({ matchId: "LA1_1500000100" })),
    ];
    for (const res of await Promise.all(routes)) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Inicia sesión para continuar." } });
    }
  });

  it("returns 409 PROFILE_REQUIRED (Spanish) without a linked Riot ID", async () => {
    signIn(USER_A, null);
    const res = await (await import("@/app/api/matches/route")).GET(get("/api/matches"));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "PROFILE_REQUIRED",
      message: expect.stringMatching(/Vincula tu Riot ID/),
    });
  });
});

describe("sync route", () => {
  it("exports maxDuration and never leaks the key", async () => {
    const mod = await import("@/app/api/sync/route");
    expect(mod.maxDuration).toBeGreaterThan(8);
    const res = await mod.POST(new Request("http://x/api/sync", { method: "POST" }));
    const text = await res.text();
    expect(res.status).toBe(429); // cooldown after the chain in beforeAll
    expect(JSON.parse(text)).toMatchObject({ error: { code: "SYNC_COOLDOWN", retryAfterS: expect.any(Number) } });
    expect(text).not.toContain(KEY);
  });
});

describe("GET /api/matches ?queue=", () => {
  const list = async (qs: string) => {
    const res = await (await import("@/app/api/matches/route")).GET(get(`/api/matches?limit=100${qs}`));
    return { status: res.status, body: (await res.json()) as { total: number; items: { queueId: number; placement: number | null }[] } };
  };

  it("defaults to all queues", async () => {
    const r = await list("");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(17);
  });

  it("filters by category and by id", async () => {
    expect((await list("&queue=ranked")).body.items.every((m) => m.queueId === 420 || m.queueId === 440)).toBe(true);
    expect((await list("&queue=ranked")).body.total).toBe(14);
    expect((await list("&queue=440")).body.total).toBe(1);
    expect((await list("&queue=aram")).body.items.map((m) => m.queueId)).toEqual([450]);
    expect((await list("&queue=arena")).body.items[0]).toMatchObject({ queueId: 1700, placement: 4 });
  });

  it("rejects an invalid queue with 422", async () => {
    const r = await list("&queue=bogus");
    expect(r.status).toBe(422);
  });
});

describe("coach only on coach-eligible queues", () => {
  it("stats: coach present for 420, null for ARAM", async () => {
    const { GET } = await import("@/app/api/stats/route");
    const solo = (await (await GET(get("/api/stats"))).json()) as { queue: string; coach: unknown; rank: { flex: unknown } };
    expect(solo.queue).toBe("420");
    expect(solo.coach).not.toBeNull();
    expect(solo.rank.flex).not.toBeNull();
    const aram = (await (await GET(get("/api/stats?queue=450"))).json()) as { coach: unknown; totals: { games: number } | null };
    expect(aram.coach).toBeNull();
  });

  it("goals: 200 for 440, 422 for ARAM/Arena", async () => {
    const { GET } = await import("@/app/api/goals/route");
    expect((await GET(get("/api/goals?queue=440"))).status).toBe(200);
    expect((await GET(get("/api/goals?queue=450"))).status).toBe(422);
    expect((await GET(get("/api/goals?queue=arena"))).status).toBe(422);
  });

  it("match detail: no tips for ARAM", async () => {
    const { GET } = await import("@/app/api/matches/[id]/route");
    const res = await GET(get("/"), ctx({ id: "LA1_1500000103" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tips: unknown[] }).tips).toEqual([]);
  });
});

describe("journal is per user", () => {
  it("user B never sees user A's entry for the same match", async () => {
    const route = await import("@/app/api/journal/[matchId]/route");
    const id = ctx({ matchId: "LA1_1500000100" });
    const put = await route.PUT(new Request("http://x", json({ deathReasons: ["greed"], lesson: "Mío", tilt: 2 })), id);
    expect(put.status).toBe(200);

    signIn(USER_B);
    const other = (await (await route.GET(get("/"), ctx({ matchId: "LA1_1500000100" }))).json()) as { entry: unknown };
    expect(other.entry).toBeNull();

    signIn(USER_A);
    const mine = (await (await route.GET(get("/"), ctx({ matchId: "LA1_1500000100" }))).json()) as { entry: { lesson: string } };
    expect(mine.entry.lesson).toBe("Mío");
  });
});

describe("GET /api/search (public)", () => {
  it("works signed out with Name-TAG, read-only, without the key in the body", async () => {
    state.viewer = { ok: false, error: apiError("UNAUTHENTICATED") };
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(new NextRequest("http://x/api/search?riotId=xDieguinho-9250", { headers: { "x-forwarded-for": "10.0.0.1" } }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ player: { puuid: PUUID }, recent: expect.any(Array) });
    expect(text).not.toContain(KEY);
  });

  it("rate-limits to 10/min per IP with 429 RATE_LIMITED", async () => {
    const { GET } = await import("@/app/api/search/route");
    const call = () => GET(new NextRequest("http://x/api/search?riotId=xDieguinho%239250", { headers: { "x-forwarded-for": "10.0.0.2" } }));
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string; retryAfterS: number } }).error).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rejects a malformed Riot ID with 422", async () => {
    const { GET } = await import("@/app/api/search/route");
    expect((await GET(new NextRequest("http://x/api/search?riotId=nodash", { headers: { "x-forwarded-for": "10.0.0.3" } }))).status).toBe(422);
  });
});

describe("GET /api/status", () => {
  it("is a non-sensitive health check", async () => {
    const text = await (await (await import("@/app/api/status/route")).GET()).text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, mockMode: true });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("xDieguinho");
  });
});
