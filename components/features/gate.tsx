/** Server helper for private pages: resolves the viewer or returns the node to render instead. */
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LinkRiotIdForm } from "@/components/features/LinkRiotIdForm";
import { Card, ErrorState } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import type { Viewer } from "@/lib/types";

export type GateResult = { viewer: Viewer; node?: undefined } | { viewer?: undefined; node: ReactNode };

export function LinkRiotIdPrompt() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-gold">Vincula tu Riot ID</h1>
      <Card description="Necesitamos tu Riot ID para traer tus partidas. Puedes cambiarlo después en Cuenta.">
        <LinkRiotIdForm />
      </Card>
    </div>
  );
}

/** Signed out → redirect to /entrar; no profile → onboarding form; failures → error state. */
export async function gatePrivate(nextPath: string): Promise<GateResult> {
  let viewer: Viewer | null;
  try {
    viewer = await getViewer();
  } catch {
    return { node: <ErrorState message="No se pudo leer tu sesión. Recarga la página." /> };
  }
  if (!viewer) redirect(`/entrar?next=${encodeURIComponent(nextPath)}`);
  if (!viewer.profile?.puuid) return { node: <LinkRiotIdPrompt /> };
  return { viewer };
}
