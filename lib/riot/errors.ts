/** Owner: cobalt. Typed failure of a Riot call; mapped to ApiErrorCode by lib/sync. Never include the key. */
export type RiotErrorKind = "unauthorized" | "not_found" | "rate_limited" | "unavailable" | "bad_response";

export class RiotApiError extends Error {
  constructor(
    readonly kind: RiotErrorKind,
    readonly status: number | null,
    readonly retryAfterS?: number,
  ) {
    super(`Riot API error: ${kind}${status === null ? "" : ` (${status})`}`);
    this.name = "RiotApiError";
  }
}
