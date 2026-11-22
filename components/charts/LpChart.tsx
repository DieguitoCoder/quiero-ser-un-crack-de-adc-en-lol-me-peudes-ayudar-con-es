/** Hand-rolled SVG: ladder score over time. y labels via rankFromLadderScore. */
import { formatRank, rankFromLadderScore } from "@/lib/coach/ranks";
import type { LadderPoint } from "@/lib/types";

export interface LpChartProps {
  points: LadderPoint[];
}

const W = 600;
const H = 240;
const PAD = { l: 96, r: 16, t: 16, b: 28 };
const LINE = "#c8aa6e";
const GRID = "#2a3e60";
const TEXT = "#a9b4c6";

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

export function LpChart({ points }: LpChartProps) {
  const title = "Progreso de rango (LP)";
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) {
    return (
      <figure>
        <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
        <p className="text-sm text-muted">
          Se necesitan al menos 2 sincronizaciones con cambios de rango para dibujar el gráfico.
        </p>
      </figure>
    );
  }
  const scores = points.map((p) => p.ladderScore);
  const lo = Math.floor((Math.min(...scores) - 20) / 50) * 50;
  const hi = Math.max(Math.ceil((Math.max(...scores) + 20) / 50) * 50, lo + 100);
  const t0 = first.takenAt;
  const t1 = last.takenAt;
  const x = (t: number) => PAD.l + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (s: number) => PAD.t + (1 - (s - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.takenAt).toFixed(1)},${y(p.ladderScore).toFixed(1)}`)
    .join(" ");
  const delta = last.ladderScore - first.ladderScore;

  return (
    <figure>
      <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="lp-title lp-desc" className="h-auto w-full">
        <title id="lp-title">{title}</title>
        <desc id="lp-desc">
          De {formatRank(first.tier, first.division, first.lp)} a {formatRank(last.tier, last.division, last.lp)} en{" "}
          {points.length} registros.
        </desc>
        {ticks.map((t) => {
          const r = rankFromLadderScore(t);
          return (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray="3 3" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TEXT}>
                {formatRank(r.tier, r.division, r.lp)}
              </text>
            </g>
          );
        })}
        <text x={PAD.l} y={H - 8} fontSize="11" fill={TEXT}>
          {fmtDate(t0)}
        </text>
        <text x={W - PAD.r} y={H - 8} fontSize="11" textAnchor="end" fill={TEXT}>
          {fmtDate(t1)}
        </text>
        <path d={path} fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.takenAt} cx={x(p.takenAt)} cy={y(p.ladderScore)} r="3.5" fill={LINE} stroke="#0a1428" />
        ))}
      </svg>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer text-text focus-visible:outline focus-visible:outline-2">
          Ver datos ({delta >= 0 ? "+" : ""}
          {delta} puntos de escalera en total)
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">Registros de rango</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Rango</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.takenAt}>
                <td>{fmtDate(p.takenAt)}</td>
                <td>{formatRank(p.tier, p.division, p.lp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
