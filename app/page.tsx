/** Dashboard: getStatsV2 / getGoalsV2 / listMatchesV2 for the signed-in user. */
import Link from "next/link";
import { ChampionWinrateChart, LpChart, TrendChart } from "@/components/charts";
import { gatePrivate } from "@/components/features/gate";
import { ModeFilter, parseMode } from "@/components/features/ModeFilter";
import { SyncButton } from "@/components/features/SyncButton";
import { Badge, Card, EmptyState, ErrorState, GoalMeter, MatchRow, RankBadge, StatCard } from "@/components/ui";
import { getGoalsV2, getStatsV2, listMatchesV2 } from "@/lib/services/v2";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ queue?: string | string[] }> }) {
  const queue = parseMode((await searchParams).queue, "420");
  const gate = await gatePrivate(`/?queue=${queue}`);
  if (!gate.viewer) return gate.node;
  const viewer = gate.viewer;

  const loaded = await Promise.all([
    getStatsV2(viewer, queue),
    listMatchesV2(viewer, { queue, limit: 5, offset: 0 }),
  ]).catch(() => null);
  if (!loaded) return <ErrorState message="No se pudieron leer tus datos. Recarga la página." />;
  const [stats, recent] = loaded;
  if (!stats.ok) return <ErrorState message={stats.error.message} code={stats.error.code} />;
  if (!recent.ok) return <ErrorState message={recent.error.message} code={recent.error.code} />;

  const s = stats.data;
  const profile = viewer.profile;
  const goals = s.coach ? await getGoalsV2(viewer, queue).catch(() => null) : null;
  const goalsData = goals?.ok ? goals.data : null;
  const ladderIsFlex = queue === "440";

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-gold">
          {profile?.gameName}
          <span className="text-muted">#{profile?.tagLine}</span>{" "}
          {profile && !profile.verified ? <Badge tone="warn">No verificado</Badge> : null}
        </h1>
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            Solo/Dúo
            <RankBadge rank={s.rank.solo} record={s.rank.solo ? { wins: s.rank.solo.wins, losses: s.rank.solo.losses } : undefined} />
          </span>
          <span className="flex items-center gap-2 text-sm text-muted">
            Flex
            <RankBadge rank={s.rank.flex} record={s.rank.flex ? { wins: s.rank.flex.wins, losses: s.rank.flex.losses } : undefined} />
          </span>
        </div>
      </div>
      <SyncButton />
    </div>
  );

  if (s.totals === null) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ModeFilter basePath="/" selected={queue} />
        <EmptyState
          title="Aún no hay partidas en este modo"
          description="Sincroniza para traer tus partidas, o prueba con otro modo."
          action={<SyncButton label="Sincronizar ahora" />}
        />
      </div>
    );
  }

  const goalTarget = (metric: "csPerMin" | "avgDeaths"): number | undefined =>
    goalsData?.goals.find((g) => g.metric === metric)?.target;
  const streakLabel = s.streak
    ? `${s.streak.count} ${s.streak.kind === "win" ? (s.streak.count === 1 ? "victoria" : "victorias") : s.streak.count === 1 ? "derrota" : "derrotas"}`
    : "—";

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ModeFilter basePath="/" selected={queue} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Racha" value={streakLabel} tone={s.streak?.kind === "loss" ? "bad" : "good"} />
        <StatCard label="Winrate" value={`${Math.round(s.totals.winrate * 100)}%`} hint={`${s.totals.games} partidas`} />
        <StatCard label="CS/min" value={s.totals.csPerMin.toFixed(1)} />
        <StatCard label="KDA" value={s.totals.kda.toFixed(2)} />
      </div>

      {s.coach ? (
        <>
          {s.coach.tilt ? (
            <div role="alert" className="rounded-card border border-warn bg-surface-2 p-4 text-text">
              <Badge tone="warn">Tilt</Badge> Perdiste tus dos últimas partidas: descansa un rato antes de volver a la cola.
            </div>
          ) : null}

          {goalsData ? (
            <Card title="Metas de la fase" description={`Fase actual: ${goalsData.phase}`}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {goalsData.goals.map((g) => (
                  <li key={g.id}>
                    <GoalMeter goal={g} headingLevel={3} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link href={`/metas?queue=${queue}`} className="text-gold underline">
                  Ver todas las metas
                </Link>
              </p>
            </Card>
          ) : null}

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
        </>
      ) : (
        <p className="rounded-card border border-border bg-surface-2 p-4 text-sm text-muted">
          El coach y las metas solo aplican a la Grieta del Invocador (SoloQ, Flex, Reclutamiento y Normales). Elige uno de
          esos modos para verlos.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Historial de LP (${ladderIsFlex ? "Flex" : "Solo/Dúo"})`}
          headingLevel={3}
          actions={
            <span className="flex gap-3 text-sm">
              <Link href="/?queue=420" aria-current={!ladderIsFlex ? "true" : undefined} className={!ladderIsFlex ? "text-gold-bright underline" : "text-muted underline"}>
                Solo/Dúo
              </Link>
              <Link href="/?queue=440" aria-current={ladderIsFlex ? "true" : undefined} className={ladderIsFlex ? "text-gold-bright underline" : "text-muted underline"}>
                Flex
              </Link>
            </span>
          }
        >
          <LpChart points={s.ladder} />
        </Card>
        <Card>
          <ChampionWinrateChart champions={s.byChampion} />
        </Card>
        {s.coach ? (
          <>
            <Card>
              <TrendChart points={s.trend} metric="csPerMin" target={goalTarget("csPerMin")} />
            </Card>
            <Card>
              <TrendChart points={s.trend} metric="deaths" target={goalTarget("avgDeaths")} />
            </Card>
          </>
        ) : null}
      </div>

      <Card
        title="Últimas partidas"
        actions={
          <Link href={`/partidas?queue=${queue}`} className="text-sm text-gold underline">
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
