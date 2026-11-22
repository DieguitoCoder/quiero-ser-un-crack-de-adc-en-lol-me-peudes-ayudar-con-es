import { fromResult, handle, jsonError, readJson, withViewer } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { runSyncBatch } from "@/lib/services/v2";
import { syncBatchInputSchema, zodFieldErrors } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. Keep SYNC_TIME_BUDGET_MS (8 s) below it. */
export const maxDuration = 10;

export async function POST(request: Request) {
  return handle(() =>
    withViewer(async (viewer) => {
      const body = await readJson(request);
      if (body === null) return jsonError(apiError("BAD_REQUEST", { message: "El cuerpo debe ser JSON válido." }));
      const parsed = syncBatchInputSchema.safeParse(body);
      if (!parsed.success) return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
      return fromResult(await runSyncBatch(viewer, parsed.data));
    }),
  );
}
