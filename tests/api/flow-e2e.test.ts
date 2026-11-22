/**
 * Owner: vera. End-to-end v2 flow through the real route handlers + real lib/auth (AUTH_MOCK=1),
 * real repos on PGlite and RIOT_MOCK=1 fixtures. Only next/headers and the Db singleton are stubbed.
 * Flow: sign-in (mock) → link Riot ID → sync loop until hasMore=false → matches per queue →
 * journal PUT/GET (+ cross-user isolation) → DELETE /api/me.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "@/tests/db/helpers";
import type { Db } from "@/lib/db/types";

const KEY = "RGAPI-flow-secret-0000-must-never-leak";
const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000b2";
const jar = new Map<string, string>();
const state: { db: Db | null } = { db: null };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: () => undefined,
  }),
}));
vi.mock("@/lib/db/client", () => ({
  getAppDb: async () => {
    if (!state.db) throw new Error("db not ready");
    return state.db;
  },
}));

const as = (userId: string) => jar.set("ct_mock_user", userId);
const req = (url: string, init?: { method: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function linkRiotId(riotId: string) {
  const { PUT } = await import("@/app/api/me/riot-id/route");
  return PUT(req("/api/me/riot-id", { method: "PUT", body: { riotId } }));
}

async function syncUntilDone(): Promise<string[]> {
  const { POST } = await import("@/app/api/sync/route");
  const texts: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const res = await POST(new Request("http://x/api/sync", { method: "POST", body: JSON.stringify({ cursor }) }));
    const text = await res.text();
    texts.push(text);
    expect(res.status).toBe(200);
    const body = JSON.parse(text) as { hasMore: boolean; cursor: string | null };
    if (!body.hasMore) return texts;
    cursor = body.cursor;
  }
  throw new Error("sync never reached hasMore=false");
}

beforeAll(async () => {
  process.env.AUTH_MOCK = "1";
  process.env.RIOT_MOCK = "1";
  process.env.RIOT_API_KEY = KEY;
  state.db = await createTestDb();
});

afterAll(() => {
  delete process.env.AUTH_MOCK;
  delete process.env.RIOT_MOCK;
  delete process.env.RIOT_API_KEY;
});

describe("v2 user flow (AUTH_MOCK + RIOT_MOCK + PGlite)", () => {
  let matchId = "";

  it("GET /api/me works before linking and sync requires a profile", async () => {
    as(USER_A);
    const me = await (await import("@/app/api/me/route")).GET();
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: USER_A }, profile: null });
    const sync = await (await import("@/app/api/sync/route")).POST(new Request("http://x/api/sync", { method: "POST", body: "{}" }));
    expect(sync.status).toBe(409);
  });

  it("rejects a malformed Riot ID and links a valid one", async () => {
    expect((await linkRiotId("no-hash-here")).status).toBe(422);
    const ok = await linkRiotId("xDieguinho#9250");
    expect(ok.status).toBe(200);
    const text = await ok.text();
    expect(text).not.toContain(KEY);
  });

  it("sync loops the cursor until hasMore=false without leaking the key", async () => {
    const texts = await syncUntilDone();
    expect(texts.length).toBeGreaterThanOrEqual(1);
    for (const t of texts) expect(t).not.toContain(KEY);
  });

  it("lists matches for queues 440 / 450 / 1700 / 400", async () => {
    const { GET } = await import("@/app/api/matches/route");
    const totals: Record<string, number> = {};
    for (const q of ["440", "450", "1700", "400"]) {
      const res = await GET(req(`/api/matches?limit=100&queue=${q}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { total: number; items: { queueId: number; matchId: string }[] };
      expect(body.items.every((m) => m.queueId === Number(q))).toBe(true);
      totals[q] = body.total;
    }
    expect(totals["440"]).toBeGreaterThan(0);
    expect(totals["450"]).toBeGreaterThan(0);
    expect(totals["1700"]).toBeGreaterThan(0);
    const all = (await (await GET(req("/api/matches?limit=1"))).json()) as { items: { matchId: string }[] };
    matchId = all.items[0]?.matchId ?? "";
    expect(matchId).toMatch(/^LA1_/);
  });

  it("journal PUT/GET round-trips and never crosses users", async () => {
    const mod = await import("@/app/api/journal/[matchId]/route");
    const put = await mod.PUT(
      req(`/api/journal/${matchId}`, { method: "PUT", body: { deathReasons: [], lesson: "Ward river at 3:00", tilt: 2 } }),
      ctx({ matchId }),
    );
    expect(put.status).toBe(200);
    const got = await mod.GET(req(`/api/journal/${matchId}`), ctx({ matchId }));
    expect(await got.json()).toMatchObject({ entry: { lesson: "Ward river at 3:00", tilt: 2 } });

    // User B links the SAME Riot ID (unverified link) — must not see A's entry.
    as(USER_B);
    expect((await linkRiotId("xDieguinho#9250")).status).toBe(200);
    const gotB = await mod.GET(req(`/api/journal/${matchId}`), ctx({ matchId }));
    expect(gotB.status).toBe(200);
    expect(await gotB.json()).toEqual({ entry: null });
    as(USER_A);
  });

  it("DELETE /api/me removes the profile and journal of the caller only", async () => {
    const { DELETE, GET } = await import("@/app/api/me/route");
    const del = await DELETE();
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });
    expect(await (await GET()).json()).toMatchObject({ user: { id: USER_A }, profile: null });
    const rows = await (state.db as Db).query<{ n: number }>("select count(*)::int as n from journal_entries where user_id = $1", [USER_A]);
    expect(rows.rows[0]?.n).toBe(0);
    as(USER_B);
    expect(await (await GET()).json()).toMatchObject({ profile: { gameName: "xDieguinho" } });
  });
});
