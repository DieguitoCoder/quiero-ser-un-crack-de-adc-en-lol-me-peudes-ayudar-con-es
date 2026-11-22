"use client";
/** Loops POST /api/sync (resumable batches) while hasMore, showing progress. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { ApiErrorBody, SyncBatchResponse } from "@/lib/types";

type SyncState =
  | { kind: "idle" }
  | { kind: "running"; total: number }
  | { kind: "ok"; added: number; total: number; cooldownUntil: number }
  | { kind: "error"; message: string };

const MAX_BATCHES = 100;
const timeFmt = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });

export function SyncButton({ label = "Sincronizar" }: { label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ kind: "idle" });
  const running = state.kind === "running";

  async function handleSync(): Promise<void> {
    setState({ kind: "running", total: 0 });
    let cursor: string | null = null;
    let added = 0;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const res: Response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cursor ? { cursor } : {}),
        });
        const body = (await res.json().catch(() => null)) as SyncBatchResponse | ApiErrorBody | null;
        if (!body || !res.ok || "error" in body) {
          const err = body && "error" in body ? body.error : null;
          let message = err?.message ?? "No se pudo sincronizar.";
          if (err?.code === "SYNC_COOLDOWN" && err.retryAfterS) {
            message = `Acabas de sincronizar. Disponible de nuevo a las ${timeFmt.format(Date.now() + err.retryAfterS * 1000)}.`;
          } else if (err?.code === "RIOT_RATE_LIMITED") {
            message = "Riot está limitando las peticiones. Espera un momento y vuelve a intentarlo; el progreso se conserva.";
          }
          setState({ kind: "error", message });
          if (added > 0) router.refresh();
          return;
        }
        added += body.newMatches;
        if (!body.hasMore) {
          setState({ kind: "ok", added, total: body.totalMatches, cooldownUntil: body.cooldownUntil });
          router.refresh();
          return;
        }
        setState({ kind: "running", total: body.totalMatches });
        cursor = body.cursor;
      }
      setState({ kind: "error", message: "Quedan partidas por traer. Vuelve a sincronizar en un par de minutos." });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "No se pudo conectar con el servidor. Inténtalo de nuevo." });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={handleSync} loading={running} loadingText="Sincronizando…">
          {label}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.kind === "running" ? <p className="text-muted">Sincronizando… {state.total} partidas</p> : null}
        {state.kind === "ok" ? (
          <p className="text-win">
            Listo: {state.added} partidas nuevas ({state.total} en total).
            {state.cooldownUntil > Date.now() ? ` Próxima sincronización a las ${timeFmt.format(state.cooldownUntil)}.` : ""}
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p role="alert" className="text-loss">
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
