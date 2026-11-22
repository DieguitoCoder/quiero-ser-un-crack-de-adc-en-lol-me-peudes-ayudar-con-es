/**
 * Route-handler helpers: ServiceResult → NextResponse, safe error handling. Owner: cobalt.
 */
import "server-only";
import { NextResponse } from "next/server";
import { apiError, errorBody, httpStatusFor } from "@/lib/errors";
import { requireViewer } from "@/lib/auth";
import type { ApiError, ApiErrorBody, ServiceResult, Viewer } from "@/lib/types";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function jsonError(error: ApiError): NextResponse<ApiErrorBody> {
  return NextResponse.json(errorBody(error), { status: httpStatusFor(error.code), headers: NO_STORE });
}

export function fromResult<T>(result: ServiceResult<T>): NextResponse<T | ApiErrorBody> {
  return result.ok ? jsonOk(result.data) : jsonError(result.error);
}

/** Wraps a handler: unexpected throws → 500 INTERNAL_ERROR with a generic Spanish message (details only in server log, never the key). */
export async function handle<T>(fn: () => Promise<NextResponse<T>>): Promise<NextResponse<T | ApiErrorBody>> {
  try {
    return await fn();
  } catch (err) {
    console.error("[api] unexpected error:", err instanceof Error ? err.message : "unknown");
    return jsonError(apiError("INTERNAL_ERROR"));
  }
}

/** Private route guard: 401 UNAUTHENTICATED (Spanish message) when signed out. */
export async function withViewer<T>(
  fn: (viewer: Viewer) => Promise<NextResponse<T | ApiErrorBody>>,
): Promise<NextResponse<T | ApiErrorBody>> {
  const viewer = await requireViewer();
  if (!viewer.ok) return jsonError(viewer.error);
  return fn(viewer.data);
}

/** Best-effort client IP (Vercel sets x-forwarded-for; first hop is the client). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Parses a JSON body; empty body → {}. null on malformed JSON. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
