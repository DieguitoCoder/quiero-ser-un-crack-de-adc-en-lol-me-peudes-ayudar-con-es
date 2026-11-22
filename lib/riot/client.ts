/**
 * Riot API client. Owner: cobalt.
 * Two implementations of `RiotClient`: HTTP (real key) and fixtures (RIOT_MOCK=1, see ./mock.ts).
 *
 * Security: the API key is only ever placed in the `X-Riot-Token` request header. It is never
 * interpolated into URLs, error messages or logs.
 */
import type { AccountDto, LeagueEntryDto, MatchDto, SummonerDto } from "@/lib/riot/dto";
import { RiotApiError } from "@/lib/riot/errors";
import { systemClock, type Clock, type RateLimiter } from "@/lib/riot/rate-limiter";

export interface MatchIdsQuery {
  /** always 420 */
  queue: number;
  start: number;
  /** 1..100 */
  count: number;
}

export interface RiotClient {
  /** GET https://{region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine} */
  getAccountByRiotId(gameName: string, tagLine: string): Promise<AccountDto>;
  /** GET https://{region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start=&count= (newest first) */
  getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]>;
  /** GET https://{region}.api.riotgames.com/lol/match/v5/matches/{matchId} */
  getMatch(matchId: string): Promise<MatchDto>;
  /**
   * GET https://{platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}
   * Fallback on 404: summoner-v4 by-puuid → league-v4 entries/by-summoner/{id}.
   */
  getLeagueEntries(puuid: string): Promise<LeagueEntryDto[]>;
}

export interface HttpRiotClientOptions {
  apiKey: string;
  platform: string;
  region: string;
  limiter: RateLimiter;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  /** retries for 429 (honours Retry-After) and 5xx/network (backoff 500ms·2^n). Default 3. */
  maxRetries?: number;
}

export const REQUEST_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const DEFAULT_RETRY_AFTER_S = 1;
/** Upper bound on how long we honour a Retry-After header inside one request. */
const MAX_RETRY_AFTER_S = 120;

const HOST_SAFE = /^[a-z0-9]{2,12}$/;

function parseRetryAfter(value: string | null): number {
  if (!value) return DEFAULT_RETRY_AFTER_S;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.min(MAX_RETRY_AFTER_S, Math.ceil(n));
  return DEFAULT_RETRY_AFTER_S;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createHttpRiotClient(options: HttpRiotClientOptions): RiotClient {
  const { apiKey, limiter } = options;
  const clock = options.clock ?? systemClock;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = Math.max(0, options.maxRetries ?? 3);
  const platform = options.platform.toLowerCase();
  const region = options.region.toLowerCase();
  if (!HOST_SAFE.test(platform) || !HOST_SAFE.test(region)) {
    throw new RiotApiError("bad_response", null);
  }
  const regionBase = `https://${region}.api.riotgames.com`;
  const platformBase = `https://${platform}.api.riotgames.com`;
  const enc = encodeURIComponent;

  async function request(url: string): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      await limiter.acquire();
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "GET",
          headers: { "X-Riot-Token": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        // Network error or timeout. Do not propagate the original error (could echo request details).
        if (attempt < maxRetries) {
          await clock.sleep(BACKOFF_BASE_MS * 2 ** attempt);
          attempt++;
          continue;
        }
        throw new RiotApiError("unavailable", null);
      }

      if (res.ok) {
        try {
          return (await res.json()) as unknown;
        } catch {
          throw new RiotApiError("bad_response", res.status);
        }
      }

      const status = res.status;
      if (status === 401 || status === 403) throw new RiotApiError("unauthorized", status);
      if (status === 404) throw new RiotApiError("not_found", status);
      if (status === 429) {
        const retryAfterS = parseRetryAfter(res.headers.get("Retry-After"));
        if (attempt < maxRetries) {
          await clock.sleep(retryAfterS * 1000);
          attempt++;
          continue;
        }
        throw new RiotApiError("rate_limited", status, retryAfterS);
      }
      if (status >= 500) {
        if (attempt < maxRetries) {
          await clock.sleep(BACKOFF_BASE_MS * 2 ** attempt);
          attempt++;
          continue;
        }
        throw new RiotApiError("unavailable", status);
      }
      // 400 and other 4xx: not retryable.
      throw new RiotApiError("bad_response", status);
    }
  }

  return {
    async getAccountByRiotId(gameName, tagLine) {
      const data = await request(`${regionBase}/riot/account/v1/accounts/by-riot-id/${enc(gameName)}/${enc(tagLine)}`);
      if (!isRecord(data) || typeof data.puuid !== "string") throw new RiotApiError("bad_response", 200);
      return data as unknown as AccountDto;
    },

    async getMatchIds(puuid, query) {
      const count = Math.min(100, Math.max(1, Math.trunc(query.count)));
      const start = Math.max(0, Math.trunc(query.start));
      const qs = new URLSearchParams({ queue: String(query.queue), start: String(start), count: String(count) });
      const data = await request(`${regionBase}/lol/match/v5/matches/by-puuid/${enc(puuid)}/ids?${qs.toString()}`);
      if (!Array.isArray(data) || !data.every((x) => typeof x === "string")) {
        throw new RiotApiError("bad_response", 200);
      }
      return data as string[];
    },

    async getMatch(matchId) {
      const data = await request(`${regionBase}/lol/match/v5/matches/${enc(matchId)}`);
      if (!isRecord(data) || !isRecord(data.info) || !Array.isArray(data.info.participants)) {
        throw new RiotApiError("bad_response", 200);
      }
      return data as unknown as MatchDto;
    },

    async getLeagueEntries(puuid) {
      let data: unknown;
      try {
        data = await request(`${platformBase}/lol/league/v4/entries/by-puuid/${enc(puuid)}`);
      } catch (err) {
        if (!(err instanceof RiotApiError) || err.kind !== "not_found") throw err;
        // Documented fallback (ARCHITECTURE §7): summoner-v4 → league-v4 by-summoner.
        const summoner = await request(`${platformBase}/lol/summoner/v4/summoners/by-puuid/${enc(puuid)}`);
        const id = isRecord(summoner) ? (summoner as unknown as SummonerDto).id : undefined;
        if (typeof id !== "string" || id === "") return [];
        data = await request(`${platformBase}/lol/league/v4/entries/by-summoner/${enc(id)}`);
      }
      if (!Array.isArray(data)) throw new RiotApiError("bad_response", 200);
      return data as LeagueEntryDto[];
    },
  };
}
