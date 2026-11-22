/** Owner: cobalt. Postgres-backed cross-instance limiter (consumeRateLimit) per routing value. */
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/db/helpers";
import type { Db } from "@/lib/db/types";
import { createGlobalLimiter } from "@/lib/riot/global-limiter";

let db: Db;
let t: number;
const now = () => t;
const sleep = async (ms: number) => {
  t += ms;
};

beforeEach(async () => {
  db = await createTestDb();
  t = 1_800_000_000_000;
});

describe("createGlobalLimiter", () => {
  it("counts each routing value separately and denies past the window without waiting beyond maxWait", async () => {
    const limiter = createGlobalLimiter(db, [{ limit: 2, windowMs: 10_000 }], now, { sleep });
    expect(await limiter.acquire("americas", "match", 0)).toEqual({ ok: true });
    expect(await limiter.acquire("americas", "match", 0)).toEqual({ ok: true });
    const denied = await limiter.acquire("americas", "match", 0);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(await limiter.acquire("la1", "league", 0)).toEqual({ ok: true });
  });

  it("waits for the next window when it fits in maxWait", async () => {
    const limiter = createGlobalLimiter(db, [{ limit: 1, windowMs: 1_000 }], now, { sleep });
    expect((await limiter.acquire("americas", "match", 0)).ok).toBe(true);
    const start = t;
    expect((await limiter.acquire("americas", "match", 2_000)).ok).toBe(true);
    expect(t).toBeGreaterThan(start);
  });

  it("applies per-method windows on top of routing windows", async () => {
    const limiter = createGlobalLimiter(db, [{ limit: 100, windowMs: 10_000 }], now, {
      sleep,
      methodWindows: { "match-ids": [{ limit: 1, windowMs: 10_000 }] },
    });
    expect((await limiter.acquire("americas", "match-ids", 0)).ok).toBe(true);
    expect((await limiter.acquire("americas", "match-ids", 0)).ok).toBe(false);
    expect((await limiter.acquire("americas", "match", 0)).ok).toBe(true);
  });
});
