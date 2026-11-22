import type { NextRequest } from "next/server";
import { fromResult, handle, withViewer } from "@/lib/api/http";
import { getGoalsV2 } from "@/lib/services/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(() => withViewer(async (viewer) => fromResult(await getGoalsV2(viewer, request.nextUrl.searchParams.get("queue")))));
}
