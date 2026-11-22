/**
 * Route-handler helpers: ServiceResult → NextResponse, safe error handling. Owner: cobalt.
 */
import "server-only";
import { NextResponse } from "next/server";
import { apiError, errorBody, httpStatusFor } from "@/lib/errors";
import type { ApiError, ApiErrorBody, ServiceResult } from "@/lib/types";

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
