"use client";
/** Logout (POST /api/auth/logout) and delete account (DELETE /api/me) with confirmation. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "logout" | "delete"): Promise<void> {
    setBusy(kind);
    setError(null);
    try {
      const res =
        kind === "logout"
          ? await fetch("/api/auth/logout", { method: "POST" })
          : await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        setError(kind === "logout" ? "No se pudo cerrar la sesión." : "No se pudo borrar la cuenta. Inténtalo de nuevo.");
        return;
      }
      router.push("/entrar");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="secondary" onClick={() => run("logout")} loading={busy === "logout"} loadingText="Cerrando…">
          Cerrar sesión
        </Button>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="del-title" className="rounded-card border border-loss/60 p-4">
          <p id="del-title" className="mb-3 text-sm text-text">
            Se borrarán tu perfil, tu Riot ID vinculado y tu diario. Esta acción no se puede deshacer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => run("delete")} loading={busy === "delete"} loadingText="Borrando…">
              Sí, borrar mi cuenta
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Borrar mi cuenta
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      ) : null}
    </div>
  );
}
