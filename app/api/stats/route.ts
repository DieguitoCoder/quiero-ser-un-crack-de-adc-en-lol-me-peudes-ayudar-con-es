import { fromResult, handle } from "@/lib/api/http";
import { getStats } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => fromResult(await getStats()));
}
