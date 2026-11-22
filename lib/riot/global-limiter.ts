/**
 * Cross-instance Riot rate limiter (v2). Owner: cobalt.
 * Serverless instances share nothing in memory, so limits are counted in Postgres via quartz's
 * `consumeRateLimit` (fixed windows), one key per routing value ("americas", "la1") and window,
 * PLUS per-method keys where Riot's method limits are tighter. On 429 from Riot, honour Retry-After
 * and stop the batch (return RIOT_RATE_LIMITED with retryAfterS) — never sleep longer than the budget.
 */
import { consumeRateLimit } from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import type { RateWindow } from "@/lib/riot/rate-limiter";

export interface GlobalLimiter {
  /** Resolves when a slot is reserved, or returns { ok:false, retryAfterMs } without waiting past `maxWaitMs`. */
  acquire(routingValue: string, method: string, maxWaitMs: number): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;
}

/** Optional per-method windows (key = method name passed by the client, e.g. "match"). */
export type MethodWindows = Readonly<Record<string, readonly RateWindow[]>>;

export function createGlobalLimiter(
  db: Db,
  windows: readonly RateWindow[],
  now: () => number,
  options: { methodWindows?: MethodWindows; sleep?: (ms: number) => Promise<void> } = {},
): GlobalLimiter {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Consumes one slot in every window; returns the wait (ms) needed when any window is full. */
  async function tryConsume(routingValue: string, method: string): Promise<number> {
    const checks: Array<{ key: string; w: RateWindow }> = windows.map((w) => ({ key: `riot:${routingValue}:${w.windowMs}`, w }));
    for (const w of options.methodWindows?.[method] ?? []) checks.push({ key: `riot:${routingValue}:${method}:${w.windowMs}`, w });
    let waitMs = 0;
    for (const { key, w } of checks) {
      const t = now();
      const r = await consumeRateLimit(db, key, w.limit, w.windowMs, t);
      if (!r.allowed) waitMs = Math.max(waitMs, Math.max(1, r.resetAt - t));
    }
    return waitMs;
  }

  return {
    async acquire(routingValue, method, maxWaitMs) {
      const deadline = now() + Math.max(0, maxWaitMs);
      for (;;) {
        const waitMs = await tryConsume(routingValue.toLowerCase(), method);
        if (waitMs === 0) return { ok: true };
        if (now() + waitMs > deadline) return { ok: false, retryAfterMs: waitMs };
        await sleep(waitMs);
      }
    },
  };
}
