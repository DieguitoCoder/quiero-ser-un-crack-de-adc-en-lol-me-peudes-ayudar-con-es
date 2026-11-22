import { handle, jsonOk } from "@/lib/api/http";
import { getStatus } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => jsonOk(await getStatus()));
}
