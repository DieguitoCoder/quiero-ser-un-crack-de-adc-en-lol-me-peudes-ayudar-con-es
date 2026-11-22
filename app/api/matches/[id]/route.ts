import { fromResult, handle, jsonError } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { getMatchDetail } from "@/lib/services";
import { matchIdSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const parsed = matchIdSchema.safeParse(id);
    if (!parsed.success) return jsonError(apiError("MATCH_NOT_FOUND"));
    return fromResult(await getMatchDetail(parsed.data));
  });
}
