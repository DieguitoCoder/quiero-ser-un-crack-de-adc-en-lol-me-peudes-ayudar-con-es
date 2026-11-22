/** getStatus() from lib/services. Never shows the API key. */
import type { Metadata } from "next";
import { SyncButton } from "@/components/features/SyncButton";
import { Badge, Card, ErrorState } from "@/components/ui";
import { getStatus } from "@/lib/services";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const status = await getStatus().catch(() => null);
  if (!status) return <ErrorState message="No se pudo leer la configuración. Recarga la página." />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">Ajustes</h1>

      <Card title="Cuenta y estado">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Riot ID</dt>
            <dd className="text-text">{status.riotId}</dd>
          </div>
          <div>
            <dt className="text-muted">Plataforma / región</dt>
            <dd className="text-text">
              {status.platform} / {status.region}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Clave de Riot</dt>
            <dd>
              <Badge tone={status.apiKeyConfigured ? "win" : "loss"}>
                {status.apiKeyConfigured ? "Configurada" : "No configurada"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Modo simulado (mock)</dt>
            <dd>
              <Badge tone={status.mockMode ? "warn" : "neutral"}>{status.mockMode ? "Activado" : "Desactivado"}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Última sincronización</dt>
            <dd className="text-text">
              {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("es") : "Nunca"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Partidas guardadas</dt>
            <dd className="text-text">{status.matchCount}</dd>
          </div>
        </dl>
        {status.lastSyncErrorCode ? (
          <p className="mt-3 text-sm text-loss">Último error de sincronización: {status.lastSyncErrorCode}</p>
        ) : null}
        <div className="mt-4">
          <SyncButton />
        </div>
      </Card>

      <Card title="Cómo conseguir tu clave de Riot">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Entra a{" "}
            <a href="https://developer.riotgames.com" className="text-gold underline" target="_blank" rel="noreferrer">
              developer.riotgames.com
            </a>{" "}
            e inicia sesión con tu cuenta de Riot.
          </li>
          <li>
            Registra una <strong>Personal API Key</strong> (recomendada: no caduca cada 24 horas como la clave de
            desarrollo).
          </li>
          <li>
            Copia la clave y guárdala en el archivo <code>.env.local</code> como <code>RIOT_API_KEY=...</code>.
          </li>
          <li>Reinicia la app y pulsa Sincronizar.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          El historial de LP empieza desde tu primera sincronización: Riot no entrega el historial anterior.
        </p>
      </Card>
    </div>
  );
}
