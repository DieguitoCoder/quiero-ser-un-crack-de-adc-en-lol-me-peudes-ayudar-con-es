import type { NextRequest } from "next/server";
import { clientIp, fromResult, handle, jsonError } from "@/lib/api/http";
import { apiError } from "@/lib/errors";
import { searchPlayer } from "@/lib/services/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Public, read-only, 10 req/min per (hashed) IP. `riotId` = "Name#TAG" or "Name-TAG". */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const riotId = request.nextUrl.searchParams.get("riotId");
    if (!riotId) return jsonError(apiError("VALIDATION_ERROR", { fields: { riotId: "Indica un Riot ID (Nombre#TAG)." } }));
    return fromResult(await searchPlayer(riotId, clientIp(request)));
  });
}
