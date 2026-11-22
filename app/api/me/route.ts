import { handle, fromResult, jsonOk } from "@/lib/api/http";
import { deleteAccount, requireViewer } from "@/lib/auth";
import { getServerEnv } from "@/lib/server-env";
import type { DeleteAccountResponse, MeResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const v = await requireViewer();
    if (!v.ok) return fromResult(v);
    return jsonOk<MeResponse>({ user: v.data.user, profile: v.data.profile, rsoEnabled: getServerEnv().rso.enabled });
  });
}

export async function DELETE() {
  return handle(async () => {
    const v = await requireViewer();
    if (!v.ok) return fromResult(v);
    const r = await deleteAccount(v.data.user.id);
    return r.ok ? jsonOk<DeleteAccountResponse>(r.data) : fromResult(r);
  });
}
