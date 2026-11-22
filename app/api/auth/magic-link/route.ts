import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/errors";
import { handle, jsonError, jsonOk, fromResult } from "@/lib/api/http";
import { sendMagicLink } from "@/lib/auth";
import { getAppDb } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/db/repos";
import { zodFieldErrors } from "@/lib/validation";
import type { MagicLinkResponse } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido").max(254),
  next: z.string().max(512).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonError(apiError("VALIDATION_ERROR", { fields: zodFieldErrors(parsed.error) }));
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `ip:magic:${createHash("sha256").update(ip).digest("hex")}`;
    const rl = await consumeRateLimit(await getAppDb(), key, 5, 60_000, Date.now());
    if (!rl.allowed) {
      return jsonError(apiError("RATE_LIMITED", { retryAfterS: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) }));
    }
    const result = await sendMagicLink(parsed.data.email, parsed.data.next);
    return result.ok ? jsonOk<MagicLinkResponse>(result.data) : fromResult(result);
  });
}
