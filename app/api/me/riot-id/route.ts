import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/errors";
import { handle, fromResult, jsonError } from "@/lib/api/http";
import { requireViewer } from "@/lib/auth";
import { linkRiotId } from "@/lib/services/v2";
import { zodFieldErrors } from "@/lib/validation";

export const runtime = "nodejs";

const schema = z.object({
  riotId: z.string().trim().min(3).max(40).regex(/^[^#]{1,16}#[^#\s]{2,5}$/, "Formato: Nombre#TAG"),
});

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const v = await requireViewer();
    if (!v.ok) return fromResult(v);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
    return fromResult(await linkRiotId(v.data, parsed.data.riotId));
  });
}
