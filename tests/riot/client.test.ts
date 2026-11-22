/** Owner: cobalt. HTTP Riot client: retries, typed errors, no key leakage. No real network or time. */
import { describe, expect, it, vi } from "vitest";
import { createHttpRiotClient } from "@/lib/riot/client";
import { RiotApiError } from "@/lib/riot/errors";
import { RateLimiter, type Clock } from "@/lib/riot/rate-limiter";

const KEY = "RGAPI-00000000-test-secret-key-do-not-leak";

function fakeClock(): Clock & { sleeps: number[]; t: number } {
  const c = {
    t: 1_000_000,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup(responses: (() => Response)[]) {
  const clock = fakeClock();
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  });
  const client = createHttpRiotClient({
    apiKey: KEY,
    platform: "la1",
    region: "americas",
    limiter: new RateLimiter(undefined, clock),
    clock,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, clock, fetchImpl };
}

describe("HTTP Riot client", () => {
  it("retries on 429 honouring Retry-After, then succeeds", async () => {
    const { client, clock, fetchImpl } = setup([
      () => json({ status: { status_code: 429 } }, 429, { "Retry-After": "3" }),
      () => json({ puuid: "p1", gameName: "xDieguinho", tagLine: "9250" }),
    ]);
    const acc = await client.getAccountByRiotId("xDieguinho", "9250");
    expect(acc.puuid).toBe("p1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(clock.sleeps).toContain(3000);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/xDieguinho/9250");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe(KEY);
  });

  it("gives up after maxRetries 429s with a rate_limited error carrying retryAfterS", async () => {
    const r429 = () => json({}, 429, { "Retry-After": "2" });
    const { client, fetchImpl } = setup([r429, r429, r429, r429]);
    const err = await client.getMatch("LA1_1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RiotApiError);
    expect((err as RiotApiError).kind).toBe("rate_limited");
    expect((err as RiotApiError).retryAfterS).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("backs off exponentially on 5xx", async () => {
    const { client, clock } = setup([() => json({}, 503), () => json({}, 500), () => json(["LA1_1", "LA1_2"])]);
    const ids = await client.getMatchIds("p1", { queue: 420, start: 0, count: 100 });
    expect(ids).toEqual(["LA1_1", "LA1_2"]);
    expect(clock.sleeps).toEqual([500, 1000]);
  });

  it.each([401, 403])("maps %i to an unauthorized error without retrying or leaking the key", async (status) => {
    const { client, fetchImpl } = setup([() => json({}, status)]);
    const err = (await client.getMatch("LA1_1").catch((e: unknown) => e)) as RiotApiError;
    expect(err.kind).toBe("unauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(err.message).not.toContain(KEY);
    expect(JSON.stringify(err)).not.toContain(KEY);
  });

  it("maps 404 to not_found", async () => {
    const { client } = setup([() => json({}, 404)]);
    const err = (await client.getAccountByRiotId("x", "y").catch((e: unknown) => e)) as RiotApiError;
    expect(err.kind).toBe("not_found");
  });

  it("falls back to summoner-v4 + entries/by-summoner when entries/by-puuid is 404", async () => {
    const entries = [{ queueType: "RANKED_SOLO_5x5", tier: "BRONZE", rank: "III", leaguePoints: 45, wins: 1, losses: 2 }];
    const { client, fetchImpl } = setup([() => json({}, 404), () => json({ id: "sum-1", puuid: "p1" }), () => json(entries)]);
    expect(await client.getLeagueEntries("p1")).toEqual(entries);
    const urls = fetchImpl.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls[2]).toBe("https://la1.api.riotgames.com/lol/league/v4/entries/by-summoner/sum-1");
  });
});

describe("RateLimiter", () => {
  it("never exceeds 20 requests per second", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(undefined, clock);
    const stamps: number[] = [];
    for (let i = 0; i < 45; i++) {
      await limiter.acquire();
      stamps.push(clock.t);
    }
    for (let i = 20; i < stamps.length; i++) {
      expect((stamps[i] ?? 0) - (stamps[i - 20] ?? 0)).toBeGreaterThanOrEqual(1000);
    }
  });

  it("enforces the 100 per 2 minutes window", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(undefined, clock);
    const start = clock.t;
    for (let i = 0; i < 101; i++) await limiter.acquire();
    expect(clock.t - start).toBeGreaterThanOrEqual(120_000);
  });
});
