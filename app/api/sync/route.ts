import { fromResult, handle } from "@/lib/api/http";
import { runSync } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => fromResult(await runSync()));
}
