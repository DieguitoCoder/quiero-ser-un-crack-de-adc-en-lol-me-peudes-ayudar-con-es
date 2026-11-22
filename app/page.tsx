/** Dashboard: getStats() + getGoals() from lib/services. */
import Link from "next/link";
import { ChampionWinrateChart, LpChart, TrendChart } from "@/components/charts";
import { SyncButton } from "@/components/features/SyncButton";
import { Badge, Card, EmptyState, ErrorState, GoalMeter, MatchRow, RankBadge, StatCard } from "@/components/ui";
import { getGoals, getStats, listMatches } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, goals, recent] = await Promise.all([getStats(), getGoals(), listMatches({ limit: 5, offset: 0 })]).catch(
    () => [null, null, null] as const,
  );
  if (!stats || !goals || !recent) {
    return <ErrorState message="No se pudieron leer los datos locales. Recarga la página." />;
  }
  if (!stats.ok) return <ErrorState message={stats.error.message} code={stats.error.code} />;
  if (!goals.ok) return <ErrorState message={goals.error.message} code={goals.error.code} />;
  if (!recent.ok) return <ErrorState message={recent.error.message} code={recent.error.code} />;

  const s = stats.data;
  if (!s.summoner || s.totals === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-gold">Dashboard</h1>
        <EmptyState
          title="Aún no hay partidas"
          description={
            <>
              Sincroniza para traer tus partidas de SoloQ. También puedes revisar la configuración en{" "}
              <Link href="/ajustes" className="underline">
                Ajustes
              </Link>
              .
            </>
          }
          action={<SyncButton label="Sincronizar ahora" />}
        />
      </div>
    );
  }

  const goalTarget = (metric: "csPerMin" | "avgDeaths"): number | undefined =>
    goals.data.goals.find((g) => g.metric === metric)?.target;
  const streakLabel = s.streak
    ? `${s.streak.count} ${s.streak.kind === "win" ? (s.streak.count === 1 ? "victoria" : "victorias") : s.streak.count === 1 ? "derrota" : "derrotas"}`
    : "—";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl text-gold">
            {s.summoner.gameName}
            <span className="text-muted">#{s.summoner.tagLine}</span>
          </h1>
          <RankBadge rank={s.rank} size="lg" record={s.rank ? { wins: s.rank.wins, losses: s.rank.losses } : undefined} />
        </div>
        <SyncButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Racha" value={streakLabel} tone={s.streak?.kind === "loss" ? "bad" : "good"} />
        <StatCard label="Winrate" value={`${Math.round(s.totals.winrate * 100)}%`} hint={`${s.totals.games} partidas`} />
        <StatCard label="CS/min" value={s.totals.csPerMin.toFixed(1)} />
        <StatCard label="KDA" value={s.totals.kda.toFixed(2)} />
      </div>

      {s.coach.tilt ? (
        <div role="alert" className="rounded-card border border-warn bg-surface-2 p-4 text-text">
          <Badge tone="warn">Tilt</Badge> Perdiste tus dos últimas partidas: descansa un rato antes de volver a la cola.
        </div>
      ) : null}

      <Card title="Metas de la fase" description={`Fase actual: ${goals.data.phase}`}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.data.goals.map((g) => (
            <li key={g.id}>
              <GoalMeter goal={g} headingLevel={3} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/metas" className="text-gold underline">
            Ver todas las metas
          </Link>
        </p>
      </Card>

      <Card title="Resumen del coach" description={`Últimas ${s.coach.games} partidas`}>
        {s.coach.insights.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay suficientes partidas para dar consejos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {s.coach.insights.map((tip) => (
              <li key={tip.ruleId} className="flex items-start gap-2 text-sm">
                <Badge tone={tip.severity === "positive" ? "win" : tip.severity === "high" ? "loss" : "warn"}>
                  {tip.severity === "positive" ? "Bien" : tip.severity === "high" ? "Importante" : "Ojo"}
                </Badge>
                <span>{tip.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <LpChart points={s.ladder} />
        </Card>
        <Card>
          <ChampionWinrateChart champions={s.byChampion} />
        </Card>
        <Card>
          <TrendChart points={s.trend} metric="csPerMin" target={goalTarget("csPerMin")} />
        </Card>
        <Card>
          <TrendChart points={s.trend} metric="deaths" target={goalTarget("avgDeaths")} />
        </Card>
      </div>

      <Card
        title="Últimas partidas"
        actions={
          <Link href="/partidas" className="text-sm text-gold underline">
            Ver todas
          </Link>
        }
      >
        <ul className="flex flex-col gap-2">
          {recent.data.items.map((m) => (
            <li key={m.matchId}>
              <MatchRow match={m} href={`/partidas/${m.matchId}`} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
