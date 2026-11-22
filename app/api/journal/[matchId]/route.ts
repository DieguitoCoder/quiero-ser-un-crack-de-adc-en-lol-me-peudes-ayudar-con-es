import { fromResult, handle, jsonError, readJson, withViewer } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { getJournalV2, saveJournalV2 } from "@/lib/services/v2";
import { journalInputSchema, matchIdSchema, zodFieldErrors } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  return handle(() =>
    withViewer(async (viewer) => {
      const id = matchIdSchema.safeParse((await params).matchId);
      if (!id.success) return jsonError(apiError("MATCH_NOT_FOUND"));
      return fromResult(await getJournalV2(viewer, id.data));
    }),
  );
}

export async function PUT(request: Request, { params }: Ctx) {
  return handle(() =>
    withViewer(async (viewer) => {
      const id = matchIdSchema.safeParse((await params).matchId);
      if (!id.success) return jsonError(apiError("MATCH_NOT_FOUND"));
      const body = await readJson(request);
      if (body === null) return jsonError(apiError("BAD_REQUEST", { message: "El cuerpo debe ser JSON válido." }));
      const parsed = journalInputSchema.safeParse(body);
      if (!parsed.success) return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
      return fromResult(await saveJournalV2(viewer, id.data, parsed.data));
    }),
  );
}
