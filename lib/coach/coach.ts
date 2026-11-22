/**
 * Rule-based coach. Pure and deterministic (no Date.now / Math.random). Owner: forge.
 * Rules and thresholds: docs/ARCHITECTURE.md §10.
 */
import type {
  CoachRuleId,
  CoachSummary,
  CoachTip,
  DeathReason,
  JournalEntry,
  MatchRecord,
  Phase,
  TipSeverity,
} from "@/lib/types";
import { DEATH_REASONS, DEATH_REASON_LABELS } from "@/lib/types";
import { aggregate, currentStreak, deriveMetrics, sortedPlayable, statsByChampion } from "@/lib/coach/metrics";

export const MAX_TIPS_PER_MATCH = 3;
export const SUMMARY_WINDOW = 10;
export const MAX_SUMMARY_INSIGHTS = 4;

const SEVERITY_RANK: Record<TipSeverity, number> = { high: 0, medium: 1, low: 2, positive: 3 };

interface RankedTip extends CoachTip {
  order: number;
}

/** Sort by severity, then rule order; strips the helper field. */
function rankTips(tips: RankedTip[], max: number): CoachTip[] {
  return tips
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.order - b.order)
    .slice(0, max)
    .map(({ ruleId, severity, message }) => ({ ruleId, severity, message }));
}

function tip(order: number, ruleId: CoachRuleId, severity: TipSeverity, message: string): RankedTip {
  return { order, ruleId, severity, message };
}

const fmt1 = (n: number): string => n.toFixed(1);
const pct = (n: number): string => String(Math.round(n * 100));
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function phaseTargets(phase: Phase): { csTarget: number; deathTarget: number } {
  return {
    csTarget: phase === "BRONZE" ? 6 : 7,
    deathTarget: phase === "GOLD" ? 4 : 5,
  };
}

/** 1..3 tips for one game; [] for remakes. */
export function tipsForMatch(game: MatchRecord, phase: Phase): CoachTip[] {
  if (game.isRemake) return [];
  const m = deriveMetrics(game);
  const { csTarget, deathTarget } = phaseTargets(phase);
  const negatives: RankedTip[] = [];

  if (game.deaths > deathTarget) {
    negatives.push(
      tip(
        1,
        "HIGH_DEATHS",
        game.deaths >= 8 ? "high" : "medium",
        `Moriste ${game.deaths} veces (meta: ${deathTarget} o menos). Revisa tus muertes en la repetición: pon wards en el río antes del minuto 3 y, si no ves al jungla rival, juega más atrás.`,
      ),
    );
  }
  if (m.csPerMin < csTarget) {
    negatives.push(
      tip(
        2,
        "LOW_CS",
        m.csPerMin < csTarget - 1 ? "high" : "medium",
        `Hiciste ${fmt1(m.csPerMin)} CS/min (meta: ${csTarget}). Practica last-hit 10 minutos en la Herramienta de Práctica y recoge oleadas laterales entre objetivos.`,
      ),
    );
  }
  if (game.csDiff10 !== null && game.csDiff10 <= -15) {
    negatives.push(
      tip(
        3,
        "LOST_LANE_CS",
        "medium",
        `Llegaste al minuto 10 con ${Math.abs(game.csDiff10)} CS menos que tu rival. Prioriza farmear seguro antes que intercambiar.`,
      ),
    );
  }
  if (game.controlWardsBought === 0) {
    negatives.push(
      tip(
        4,
        "NO_CONTROL_WARD",
        phase === "BRONZE" ? "low" : "medium",
        "No compraste ninguna control ward. Compra una en cada regreso a base.",
      ),
    );
  }
  if (game.teamKills >= 10 && m.killParticipation < 0.4) {
    negatives.push(
      tip(
        5,
        "LOW_KILL_PARTICIPATION",
        phase === "GOLD" ? "medium" : "low",
        `Participaste en el ${pct(m.killParticipation)}% de las kills de tu equipo. Agrúpate tras la primera torre, para dragones y peleas cuando tu línea esté empujada.`,
      ),
    );
  }
  if (m.visionPerMin < 0.4) {
    negatives.push(
      tip(
        6,
        "LOW_VISION",
        "low",
        `Tu puntuación de visión fue baja (${fmt1(m.visionPerMin)}/min). Usa tu trinket y limpia wards con la control ward.`,
      ),
    );
  }

  if (negatives.length === 0) {
    return [
      {
        ruleId: "GOOD_GAME",
        severity: "positive",
        message: game.win
          ? "¡Buena partida! Cumpliste lo básico: farmeo, muertes y visión."
          : "Tus números fueron buenos aunque perdiste. Sigue así: la constancia sube LP.",
      },
    ];
  }
  return rankTips(negatives, MAX_TIPS_PER_MATCH);
}

/** true when the 2 most recent non-remake games are both losses. */
export function isTilted(games: readonly MatchRecord[]): boolean {
  const gs = sortedPlayable(games).slice(-2);
  return gs.length === 2 && gs.every((g) => !g.win);
}

function topDeathReason(entries: readonly JournalEntry[]): { reason: DeathReason; count: number } | null {
  let best: { reason: DeathReason; count: number } | null = null;
  for (const reason of DEATH_REASONS) {
    const count = entries.filter((e) => e.deathReasons.includes(reason)).length;
    if (count > 0 && (best === null || count > best.count)) best = { reason, count };
  }
  return best;
}

/** Summary over the last SUMMARY_WINDOW non-remake games plus their journal entries. */
export function summarizeRecent(
  games: readonly MatchRecord[],
  journal: readonly JournalEntry[],
  _phase: Phase,
): CoachSummary {
  const window = sortedPlayable(games).slice(-SUMMARY_WINDOW);
  const stats = aggregate(window);
  const tilt = isTilted(window);
  const insights: RankedTip[] = [];

  if (tilt) {
    const n = currentStreak(window)?.count ?? 2;
    insights.push(
      tip(
        1,
        "TILT_LOSS_STREAK",
        "high",
        `Llevas ${n} derrotas seguidas: descansa 10-15 minutos antes de jugar otra. Descansa un rato antes de la próxima ranked.`,
      ),
    );
  }

  // Journal entries that belong to a window game, newest game first.
  const time = new Map(window.map((g) => [g.matchId, g.gameCreation]));
  const entries = journal
    .filter((e) => time.has(e.matchId))
    .sort((a, b) => (time.get(b.matchId) ?? 0) - (time.get(a.matchId) ?? 0) || byName(a.matchId, b.matchId));

  if (entries.slice(0, 3).filter((e) => e.tilt !== null && e.tilt >= 4).length >= 2) {
    insights.push(
      tip(2, "TILT_SELF_REPORTED", "high", "Tu diario indica tilt alto en las últimas partidas. Haz una pausa o termina la sesión por hoy."),
    );
  }

  const top = topDeathReason(entries);
  if (top && top.count >= 3) {
    insights.push(
      tip(
        3,
        "TOP_DEATH_REASON",
        "medium",
        `Tu causa de muerte más repetida es «${DEATH_REASON_LABELS[top.reason]}» (${top.count} veces). Enfócate en eso la próxima partida.`,
      ),
    );
  }

  if (window.length >= SUMMARY_WINDOW) {
    const prev = aggregate(window.slice(0, 5));
    const last = aggregate(window.slice(5));
    if (prev && last) {
      const dd = last.avgDeaths - prev.avgDeaths;
      if (dd >= 1) {
        insights.push(
          tip(
            4,
            "DEATHS_TREND",
            "medium",
            `Estás muriendo más (${fmt1(last.avgDeaths)} vs ${fmt1(prev.avgDeaths)}). Juega más seguro y pon wards antes de avanzar.`,
          ),
        );
      } else if (dd <= -1) {
        insights.push(
          tip(4, "DEATHS_TREND", "positive", `Estás muriendo menos (${fmt1(last.avgDeaths)} vs ${fmt1(prev.avgDeaths)}). ¡Bien!`),
        );
      }
      const dc = last.csPerMin - prev.csPerMin;
      if (dc <= -0.5) {
        insights.push(
          tip(
            5,
            "CS_TREND",
            "medium",
            `Tu farmeo bajó (${fmt1(last.csPerMin)} vs ${fmt1(prev.csPerMin)} CS/min). Practica last-hit 10 minutos en la Herramienta de Práctica.`,
          ),
        );
      } else if (dc >= 0.5) {
        insights.push(
          tip(5, "CS_TREND", "positive", `Tu farmeo mejoró (${fmt1(last.csPerMin)} vs ${fmt1(prev.csPerMin)} CS/min).`),
        );
      }
    }
  }

  const champs = statsByChampion(window).filter((c) => c.games >= 3);
  const worst = champs
    .filter((c) => c.winrate <= 0.34)
    .sort((a, b) => a.winrate - b.winrate || b.games - a.games || byName(a.championName, b.championName))[0];
  if (worst) {
    insights.push(
      tip(
        6,
        "WORST_CHAMPION",
        "low",
        `Con ${worst.championName} vas ${worst.wins}-${worst.games - worst.wins} en tus últimas partidas. Considera practicarlo en normales.`,
      ),
    );
  }
  const best = champs
    .filter((c) => c.winrate >= 0.6)
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games || byName(a.championName, b.championName))[0];
  if (best) {
    insights.push(
      tip(7, "BEST_CHAMPION", "positive", `${best.championName} es tu mejor pick ahora (${best.wins}-${best.games - best.wins}). Priorízalo en SoloQ.`),
    );
  }

  return { games: window.length, stats, tilt, insights: rankTips(insights, MAX_SUMMARY_INSIGHTS) };
}
