import { fromResult, handle, jsonError, withViewer } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { getMatchDetailV2 } from "@/lib/services/v2";
import { matchIdSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() =>
    withViewer(async (viewer) => {
      const parsed = matchIdSchema.safeParse((await params).id);
      if (!parsed.success) return jsonError(apiError("MATCH_NOT_FOUND"));
      return fromResult(await getMatchDetailV2(viewer, parsed.data));
    }),
  );
}
