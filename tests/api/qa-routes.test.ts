/**
 * Owner: vera (QA). End-to-end exercise of the route handlers against a real
 * on-disk SQLite file in a not-yet-existing directory (fresh checkout scenario).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Db } from "@/lib/db/connection";

const KEY = "RGAPI-qa-secret-0000-should-never-leak";
const DIR = path.join(process.cwd(), "data", "qa-tmp");
const globalForDb = globalThis as unknown as { __climbDb?: Db };

function resetDb() {
  globalForDb.__climbDb?.close();
  globalForDb.__climbDb = undefined;
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const put = (body: string) =>
  new Request("http://x/api/journal", { method: "PUT", headers: { "content-type": "application/json" }, body });

beforeAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  resetDb();
  process.env.CLIMB_DB_PATH = path.join(DIR, "qa.db");
  process.env.RIOT_MOCK = "1";
  process.env.RIOT_API_KEY = KEY;
});

afterAll(() => {
  resetDb();
  fs.rmSync(DIR, { recursive: true, force: true });
  delete process.env.RIOT_MOCK;
  delete process.env.RIOT_API_KEY;
  delete process.env.CLIMB_DB_PATH;
});

describe("QA: route handlers in mock mode with a file DB", () => {
  it("creates the data dir, syncs idempotently and serves every API", async () => {
    const sync = await import("@/app/api/sync/route");
    const matches = await import("@/app/api/matches/route");
    const matchDetail = await import("@/app/api/matches/[id]/route");
    const journal = await import("@/app/api/journal/[matchId]/route");
    const stats = await import("@/app/api/stats/route");
    const goals = await import("@/app/api/goals/route");
    const status = await import("@/app/api/status/route");

    const s1 = await sync.POST();
    expect(s1.status).toBe(200);
    expect(fs.existsSync(path.join(DIR, "qa.db"))).toBe(true);

    const count = async () =>
      ((await (await matches.GET(new NextRequest("http://x/api/matches?limit=100"))).json()) as { total: number; items: { matchId: string }[] });
    const c1 = await count();
    const s2 = await sync.POST();
    expect(s2.status).toBe(200);
    expect(((await s2.json()) as { newMatches: number }).newMatches).toBe(0);
    const c2 = await count();
    expect(c2.total).toBe(c1.total);
    expect(new Set(c2.items.map((i) => i.matchId)).size).toBe(c2.items.length);

    // SQL-injection-ish / bad query params must not crash
    const bad = await matches.GET(new NextRequest("http://x/api/matches?champion=Ji'nx;--&limit=-5"));
    expect([200, 400, 422]).toContain(bad.status);

    const id = c1.items[0]?.matchId ?? "";
    expect(id).not.toBe("");
    expect((await matchDetail.GET(new Request("http://x"), ctx({ id }))).status).toBe(200);
    expect((await matchDetail.GET(new Request("http://x"), ctx({ id: "LA1_1" }))).status).toBe(404);
    expect((await stats.GET()).status).toBe(200);
    expect((await goals.GET()).status).toBe(200);

    const ok = await journal.PUT(put(JSON.stringify({ deathReasons: ["no_vision", "no_vision"], lesson: "  Wardear río  ", tilt: 3 })), ctx({ matchId: id }));
    expect(ok.status).toBe(200);
    const back = (await (await journal.GET(new Request("http://x"), ctx({ matchId: id }))).json()) as {
      entry: { deathReasons: string[]; lesson: string; tilt: number };
    };
    expect(back.entry).toMatchObject({ deathReasons: ["no_vision"], lesson: "Wardear río", tilt: 3 });

    const invalid = await journal.PUT(put(JSON.stringify({ deathReasons: ["bogus"], lesson: "x".repeat(1001), tilt: 9 })), ctx({ matchId: id }));
    expect(invalid.status).toBe(422);
    const invalidBody = JSON.stringify(await invalid.json());
    expect(invalidBody).toContain("Máximo 1000 caracteres");

    const badJson = await journal.PUT(put("{oops"), ctx({ matchId: id }));
    expect(badJson.status).toBe(400);
    expect(JSON.stringify(await badJson.json())).toContain("JSON válido");

    const st = await status.GET();
    const text = await st.text();
    expect(st.status).toBe(200);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("should-never-leak");
  });

  it("without mock and without key, POST /api/sync returns the Spanish missing-key error", async () => {
    delete process.env.RIOT_MOCK;
    delete process.env.RIOT_API_KEY;
    resetDb();
    const sync = await import("@/app/api/sync/route");
    const res = await sync.POST();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("Falta la API key de Riot");
  });
});
