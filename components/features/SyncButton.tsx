"use client";
/** POST /api/sync, show Spanish result/error, then router.refresh(). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { ApiErrorBody, SyncResponse } from "@/lib/types";

type SyncState =
  | { kind: "idle" }
  | { kind: "ok"; result: SyncResponse }
  | { kind: "error"; message: string };

export function SyncButton({ label = "Sincronizar" }: { label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SyncState>({ kind: "idle" });

  async function handleSync(): Promise<void> {
    setLoading(true);
    setState({ kind: "idle" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json()) as SyncResponse | ApiErrorBody;
      if (!res.ok || "error" in body) {
        const message = "error" in body ? body.error.message : "No se pudo sincronizar.";
        setState({ kind: "error", message });
      } else {
        setState({ kind: "ok", result: body });
        router.refresh();
      }
    } catch {
      setState({ kind: "error", message: "No se pudo conectar con el servidor. Inténtalo de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={handleSync} loading={loading} loadingText="Sincronizando…">
          {label}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.kind === "ok" ? (
          <p className="text-win">
            Listo: {state.result.newMatches} partidas nuevas ({state.result.totalMatches} en total).
            {state.result.hasMore ? " Hay más partidas, sincroniza de nuevo." : ""}
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
