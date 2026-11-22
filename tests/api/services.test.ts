/**
 * Owner: cobalt. Services + route handlers backed by a temp (in-memory) DB.
 * Only endpoints that do not depend on lib/coach are exercised here (coach is tested by forge).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/connection";
import type { StatusResponse } from "@/lib/types";

const KEY = "RGAPI-12345678-abcd-efgh-ijkl-secretsecret";
const globalForDb = globalThis as unknown as { __climbDb?: Db };

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  globalForDb.__climbDb?.close();
  globalForDb.__climbDb = undefined;
  setEnv({ CLIMB_DB_PATH: ":memory:", RIOT_API_KEY: undefined, RIOT_MOCK: undefined, RIOT_ID: undefined });
});

afterEach(() => {
  vi.restoreAllMocks();
  setEnv({ RIOT_API_KEY: undefined, RIOT_MOCK: undefined });
});

describe("runSync", () => {
  it("returns RIOT_KEY_MISSING (Spanish message) without any network call when no key and no mock", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { runSync, getStatus } = await import("@/lib/services");
    const res = await runSync();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("RIOT_KEY_MISSING");
    expect(res.error.message).toMatch(/Falta la API key de Riot/);
    expect(res.error.message).toMatch(/RIOT_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await getStatus()).lastSyncErrorCode).toBe("RIOT_KEY_MISSING");
  });

  // TODO(cobalt): v2 — route now requires auth; covered by tests/api/routes-v2.test.ts
  it.skip("POST /api/sync responds 503 with the error body", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(new Request("http://x/api/sync", { method: "POST" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RIOT_KEY_MISSING");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("syncs from fixtures in mock mode, then lists matches and journal round-trips", async () => {
    setEnv({ RIOT_MOCK: "1" });
    const { runSync, listMatches, saveJournal, getJournal, getStatus } = await import("@/lib/services");
    const res = await runSync();
    expect(res.ok && res.data.mock).toBe(true);
    expect(res.ok && res.data.newMatches).toBe(13);

    const list = await listMatches({ limit: 5, offset: 0 });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.items).toHaveLength(5);
    expect(list.data.total).toBe(13);
    expect(list.data.champions).toHaveLength(4);
    const first = list.data.items[0];
    expect(first?.win).toBe(false);
    const filtered = await listMatches({ champion: "Ashe", limit: 20, offset: 0 });
    expect(filtered.ok && filtered.data.items.every((i) => i.championName === "Ashe")).toBe(true);

    const id = first?.matchId ?? "";
    const saved = await saveJournal(id, { deathReasons: ["no_vision"], lesson: "Wardear río", tilt: 2 });
    expect(saved.ok && saved.data.entry?.deathReasons).toEqual(["no_vision"]);
    const got = await getJournal(id);
    expect(got.ok && got.data.entry?.lesson).toBe("Wardear río");
    const missing = await getJournal("LA1_1");
    expect(!missing.ok && missing.error.code).toBe("MATCH_NOT_FOUND");

    const status = await getStatus();
    expect(status).toMatchObject({ mockMode: true, matchCount: 13, summonerResolved: true, lastSyncErrorCode: null });
  });
});

// TODO(cobalt): v2 — /api/status is now a non-sensitive health check (routes-v2.test.ts)
describe.skip("GET /api/status", () => {
  it("never leaks the API key (or any fragment of it)", async () => {
    setEnv({ RIOT_API_KEY: KEY });
    const { GET } = await import("@/app/api/status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as StatusResponse;
    expect(body.apiKeyConfigured).toBe(true);
    expect(body.riotId).toBe("xDieguinho#9250");
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("RGAPI");
    for (const part of KEY.split("-").filter((p) => p.length >= 4)) expect(text).not.toContain(part);
  });

  it("reports apiKeyConfigured=false when the key is missing", async () => {
    const { getStatus } = await import("@/lib/services");
    expect((await getStatus()).apiKeyConfigured).toBe(false);
  });
});
