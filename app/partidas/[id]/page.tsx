/** getMatchDetail(id) from lib/services; JournalForm for the diary. */
import Link from "next/link";
import { ChampionIcon, Badge, Card, ErrorState, StatCard } from "@/components/ui";
import { JournalForm } from "@/components/features/JournalForm";
import { getMatchDetail } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getMatchDetail(id).catch(() => null);
  if (!result) return <ErrorState message="No se pudo leer la partida. Recarga la página." />;
  if (!result.ok) {
    return (
      <ErrorState
        title={result.error.code === "MATCH_NOT_FOUND" ? "Partida no encontrada" : undefined}
        message={result.error.message}
        code={result.error.code}
        action={
          <Link href="/partidas" className="text-gold underline">
            Volver a partidas
          </Link>
        }
      />
    );
  }
  const { match: m, tips, journal } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <p>
        <Link href="/partidas" className="text-sm text-gold underline">
          ← Partidas
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ChampionIcon championName={m.championName} size={56} />
        <div>
          <h1 className="font-display text-2xl text-gold">{m.championName}</h1>
          <p className="text-sm text-muted">
            {new Date(m.gameCreation).toLocaleString("es")} · parche {m.patch}
          </p>
        </div>
        {m.isRemake ? <Badge tone="neutral">Remake</Badge> : <Badge tone={m.win ? "win" : "loss"}>{m.win ? "Victoria" : "Derrota"}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="KDA" value={`${m.kills}/${m.deaths}/${m.assists}`} hint={`${m.kda.toFixed(2)} ratio`} />
        <StatCard label="CS/min" value={m.csPerMin.toFixed(1)} hint={`${m.csTotal} CS`} />
        <StatCard label="Participación" value={`${Math.round(m.killParticipation * 100)}%`} />
        <StatCard label="Visión" value={m.visionScore} hint={`${m.controlWardsBought} control wards`} />
        <StatCard label="Duración" value={`${Math.round(m.durationMin)} min`} />
        <StatCard label="Oro/min" value={Math.round(m.goldPerMin)} />
        <StatCard label="Daño/min" value={Math.round(m.damagePerMin)} />
        <StatCard
          label="Rival de línea"
          value={m.opponentChampionName ?? "Sin datos"}
          hint={m.csDiffVsOpponent === null ? undefined : `${m.csDiffVsOpponent > 0 ? "+" : ""}${m.csDiffVsOpponent} CS`}
        />
      </div>

      <Card title="Consejos del coach">
        {tips.length === 0 ? (
          <p className="text-sm text-muted">No hay consejos para esta partida.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tips.map((tip) => (
              <li key={tip.ruleId} className="text-sm">
                {tip.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Diario">
        <JournalForm key={journal?.updatedAt ?? "new"} matchId={m.matchId} initial={journal} />
      </Card>
    </div>
  );
}
