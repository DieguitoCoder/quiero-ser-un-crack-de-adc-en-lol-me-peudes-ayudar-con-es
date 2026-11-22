import type { NextRequest } from "next/server";
import { fromResult, handle, jsonError } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { listMatches } from "@/lib/services";
import { matchListQuerySchema, zodFieldErrors } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = matchListQuerySchema.safeParse(params);
    if (!parsed.success) {
      return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
    }
    return fromResult(await listMatches(parsed.data));
  });
}
