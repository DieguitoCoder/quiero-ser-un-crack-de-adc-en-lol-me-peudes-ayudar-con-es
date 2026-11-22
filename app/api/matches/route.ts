import type { NextRequest } from "next/server";
import { fromResult, handle, jsonError, withViewer } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { listMatchesV2 } from "@/lib/services/v2";
import { matchListQueryV2Schema, zodFieldErrors } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(() =>
    withViewer(async (viewer) => {
      const parsed = matchListQueryV2Schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
      if (!parsed.success) return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
      return fromResult(await listMatchesV2(viewer, parsed.data));
    }),
  );
}
