/**
 * Pure metric functions. Owner: forge. Remakes (isRemake) are ignored by every aggregate.
 * Inputs may arrive in any order; sort by (gameCreation, matchId) ascending internally.
 */
import type {
  AggregateStats,
  ChampionStats,
  DerivedMetrics,
  MatchRecord,
  OpponentStats,
  Streak,
  TrendPoint,
} from "@/lib/types";

export const MOVING_AVERAGE_WINDOW = 5;

function cmp(a: MatchRecord, b: MatchRecord): number {
  if (a.gameCreation !== b.gameCreation) return a.gameCreation - b.gameCreation;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** Non-remake games, oldest first (deterministic). */
export function sortedPlayable(games: readonly MatchRecord[]): MatchRecord[] {
  return games.filter((g) => !g.isRemake).sort(cmp);
}

function minutes(g: MatchRecord): number {
  return Math.max(0, g.gameDurationS) / 60;
}

function div(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

export function deriveMetrics(game: MatchRecord): DerivedMetrics {
  const m = minutes(game);
  return {
    durationMin: m,
    csPerMin: div(game.csTotal, m),
    kda: (game.kills + game.assists) / Math.max(1, game.deaths),
    killParticipation: div(game.kills + game.assists, game.teamKills),
    goldPerMin: div(game.goldEarned, m),
    damagePerMin: div(game.damageToChampions, m),
    visionPerMin: div(game.visionScore, m),
    csDiffVsOpponent: game.opponentCsTotal === null ? null : game.csTotal - game.opponentCsTotal,
  };
}

function sum(games: readonly MatchRecord[], f: (g: MatchRecord) => number): number {
  return games.reduce((acc, g) => acc + f(g), 0);
}

/** null when there are no non-remake games. */
export function aggregate(games: readonly MatchRecord[]): AggregateStats | null {
  const gs = games.filter((g) => !g.isRemake);
  const n = gs.length;
  if (n === 0) return null;
  const wins = gs.filter((g) => g.win).length;
  const mins = sum(gs, minutes);
  const kills = sum(gs, (g) => g.kills);
  const deaths = sum(gs, (g) => g.deaths);
  const assists = sum(gs, (g) => g.assists);
  return {
    games: n,
    wins,
    losses: n - wins,
    winrate: wins / n,
    avgKills: kills / n,
    avgDeaths: deaths / n,
    avgAssists: assists / n,
    kda: (kills + assists) / Math.max(1, deaths),
    csPerMin: div(sum(gs, (g) => g.csTotal), mins),
    killParticipation: div(kills + assists, sum(gs, (g) => g.teamKills)),
    visionPerMin: div(sum(gs, (g) => g.visionScore), mins),
    controlWardsPerGame: sum(gs, (g) => g.controlWardsBought) / n,
    goldPerMin: div(sum(gs, (g) => g.goldEarned), mins),
    damagePerMin: div(sum(gs, (g) => g.damageToChampions), mins),
  };
}

/** Trailing mean; positions with fewer than `window` values are null. */
export function movingAverage(values: readonly number[], window: number): (number | null)[] {
  const w = Math.floor(window);
  return values.map((_, i) => {
    if (w < 1 || i + 1 < w) return null;
    let s = 0;
    for (let j = i - w + 1; j <= i; j++) s += values[j] ?? 0;
    return s / w;
  });
}

/** Current streak counted from the most recent game; null when no games. */
export function currentStreak(games: readonly MatchRecord[]): Streak | null {
  const gs = sortedPlayable(games);
  const last = gs[gs.length - 1];
  if (!last) return null;
  let count = 0;
  for (let i = gs.length - 1; i >= 0 && gs[i]?.win === last.win; i--) count++;
  return { kind: last.win ? "win" : "loss", count };
}

function groupBy(games: readonly MatchRecord[], key: (g: MatchRecord) => string | null): Map<string, MatchRecord[]> {
  const map = new Map<string, MatchRecord[]>();
  for (const g of games) {
    const k = key(g);
    if (k === null || k === "") continue;
    const list = map.get(k);
    if (list) list.push(g);
    else map.set(k, [g]);
  }
  return map;
}

function byGamesThenName<T extends { games: number }>(items: T[], name: (t: T) => string): T[] {
  return items.sort((a, b) => b.games - a.games || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
}

/** Sorted by games desc, then championName asc. */
export function statsByChampion(games: readonly MatchRecord[]): ChampionStats[] {
  const out: ChampionStats[] = [];
  for (const [championName, list] of groupBy(sortedPlayable(games), (g) => g.championName)) {
    const agg = aggregate(list);
    const first = list[0];
    if (!agg || !first) continue;
    out.push({
      championName,
      championId: first.championId,
      games: agg.games,
      wins: agg.wins,
      winrate: agg.winrate,
      kda: agg.kda,
      csPerMin: agg.csPerMin,
      avgDeaths: agg.avgDeaths,
    });
  }
  return byGamesThenName(out, (c) => c.championName);
}

/** Games without lane opponent are excluded. Sorted by games desc, then name asc. */
export function statsByOpponent(games: readonly MatchRecord[]): OpponentStats[] {
  const out: OpponentStats[] = [];
  for (const [opponentChampionName, list] of groupBy(sortedPlayable(games), (g) => g.opponentChampionName)) {
    const wins = list.filter((g) => g.win).length;
    const diffs = list.map((g) => g.csDiff10).filter((d): d is number => d !== null);
    out.push({
      opponentChampionName,
      games: list.length,
      wins,
      winrate: wins / list.length,
      avgCsDiff: diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    });
  }
  return byGamesThenName(out, (o) => o.opponentChampionName);
}

/** Oldest first; MA window = MOVING_AVERAGE_WINDOW. */
export function buildTrend(games: readonly MatchRecord[]): TrendPoint[] {
  const gs = sortedPlayable(games);
  const cs = gs.map((g) => deriveMetrics(g).csPerMin);
  const deaths = gs.map((g) => g.deaths);
  const csMa = movingAverage(cs, MOVING_AVERAGE_WINDOW);
  const dMa = movingAverage(deaths, MOVING_AVERAGE_WINDOW);
  return gs.map((g, i) => ({
    matchId: g.matchId,
    gameCreation: g.gameCreation,
    championName: g.championName,
    win: g.win,
    csPerMin: cs[i] ?? 0,
    deaths: g.deaths,
    csPerMinMa5: csMa[i] ?? null,
    deathsMa5: dMa[i] ?? null,
  }));
}
