import type { NextRequest } from "next/server";
import { fromResult, handle, withViewer } from "@/lib/api/http";
import { getStatsV2 } from "@/lib/services/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(() => withViewer(async (viewer) => fromResult(await getStatsV2(viewer, request.nextUrl.searchParams.get("queue")))));
}
