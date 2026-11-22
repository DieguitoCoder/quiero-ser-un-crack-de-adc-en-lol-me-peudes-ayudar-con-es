/**
 * Sliding-window limiter for the dev key: 20 req / 1 s AND 100 req / 120 s. Owner: cobalt.
 * Clock and sleep are injectable so tests run instantly and deterministically.
 */
export interface RateWindow {
  limit: number;
  windowMs: number;
}

export const DEV_KEY_LIMITS: readonly RateWindow[] = [
  { limit: 20, windowMs: 1_000 },
  { limit: 100, windowMs: 120_000 },
];

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class RateLimiter {
  constructor(
    readonly windows: readonly RateWindow[] = DEV_KEY_LIMITS,
    readonly clock: Clock = systemClock,
  ) {}

  /** Send timestamps, oldest first (kept only as long as the longest window). */
  private readonly sent: number[] = [];
  /** Serializes concurrent acquire() calls so slots are granted in order. */
  private queue: Promise<void> = Promise.resolve();

  /** Resolves when a request may be sent (and records it). */
  acquire(): Promise<void> {
    const next = this.queue.then(() => this.waitForSlot());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async waitForSlot(): Promise<void> {
    const maxWindow = Math.max(0, ...this.windows.map((w) => w.windowMs));
    for (;;) {
      const now = this.clock.now();
      while (this.sent.length > 0 && (this.sent[0] ?? 0) <= now - maxWindow) this.sent.shift();
      let waitMs = 0;
      for (const w of this.windows) {
        const inWindow = this.sent.filter((t) => t > now - w.windowMs);
        if (inWindow.length >= w.limit) {
          // Oldest request that must expire to free a slot in this window.
          const oldest = inWindow[inWindow.length - w.limit] ?? now;
          waitMs = Math.max(waitMs, oldest + w.windowMs - now);
        }
      }
      if (waitMs <= 0) {
        this.sent.push(now);
        return;
      }
      await this.clock.sleep(waitMs);
    }
  }
}
