/** Account: profile, linked Riot ID, logout, delete account. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/features/AccountActions";
import { LinkRiotIdForm } from "@/components/features/LinkRiotIdForm";
import { Badge, Card, ErrorState } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import type { Viewer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cuenta" };

export default async function AccountPage() {
  let viewer: Viewer | null;
  try {
    viewer = await getViewer();
  } catch {
    return <ErrorState message="No se pudo leer tu cuenta. Recarga la página." />;
  }
  if (!viewer) redirect("/entrar?next=%2Fcuenta");
  const p = viewer.profile;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">Cuenta</h1>

      <Card title="Perfil">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Correo</dt>
            <dd className="text-text">{viewer.user.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Riot ID vinculado</dt>
            <dd className="text-text">
              {p?.puuid ? (
                <>
                  {p.gameName}#{p.tagLine} ({p.platform}){" "}
                  <Badge tone={p.verified ? "win" : "warn"}>{p.verified ? "Verificado" : "No verificado"}</Badge>
                </>
              ) : (
                "Sin vincular"
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title={p?.puuid ? "Cambiar Riot ID" : "Vincula tu Riot ID"}>
        <LinkRiotIdForm />
      </Card>

      <Card title="Sesión y datos">
        <AccountActions />
      </Card>
    </div>
  );
}
