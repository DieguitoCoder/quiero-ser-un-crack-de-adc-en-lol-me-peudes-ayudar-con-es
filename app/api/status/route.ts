import { handle, jsonOk } from "@/lib/api/http";
import { getServerEnv } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-sensitive health only (no Riot ID, no key, no counts). */
export async function GET() {
  return handle(async () => jsonOk({ ok: true as const, mockMode: getServerEnv().riotMock, time: Date.now() }));
}
