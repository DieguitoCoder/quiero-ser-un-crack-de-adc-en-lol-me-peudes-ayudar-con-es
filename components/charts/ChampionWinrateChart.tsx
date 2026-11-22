/** Hand-rolled SVG: horizontal winrate bars, x axis 0-100%, games (n) always visible. */
import type { ChampionStats } from "@/lib/types";

export interface ChampionWinrateChartProps {
  champions: ChampionStats[];
}

const W = 600;
const PAD = { l: 110, r: 120, t: 8, b: 28 };
const ROW = 28;
const BAR = "#0ac8b9";
const GRID = "#2a3e60";
const TEXT = "#a9b4c6";
const MAX_ROWS = 8;

const pct = (r: number): string => `${Math.round(r * 100)}%`;

export function ChampionWinrateChart({ champions }: ChampionWinrateChartProps) {
  const title = "Winrate por campeón";
  if (champions.length === 0) {
    return (
      <figure>
        <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
        <p className="text-sm text-muted">Aún no hay partidas para calcular el winrate por campeón.</p>
      </figure>
    );
  }
  const rows = [...champions].sort((a, b) => b.games - a.games).slice(0, MAX_ROWS);
  const H = PAD.t + PAD.b + rows.length * ROW;
  const plotW = W - PAD.l - PAD.r;
  const x = (ratio: number): number => PAD.l + ratio * plotW;

  return (
    <figure>
      <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="wr-t wr-d" className="h-auto w-full">
        <title id="wr-t">{title}</title>
        <desc id="wr-d">Winrate de los {rows.length} campeones más jugados, de 0% a 100%.</desc>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke={GRID}
              strokeDasharray={t === 0 ? undefined : "3 3"}
            />
            <text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill={TEXT}>
              {pct(t)}
            </text>
          </g>
        ))}
        {rows.map((c, i) => {
          const cy = PAD.t + i * ROW;
          return (
            <g key={c.championName}>
              <text x={PAD.l - 8} y={cy + ROW / 2 + 4} textAnchor="end" fontSize="12" fill="#f0e6d2">
                {c.championName}
              </text>
              <rect x={x(0)} y={cy + 5} width={Math.max(2, c.winrate * plotW)} height={ROW - 10} rx="3" fill={BAR} />
              <text x={x(c.winrate) + 6} y={cy + ROW / 2 + 4} fontSize="11" fill={TEXT}>
                {pct(c.winrate)} · {c.games} {c.games === 1 ? "partida" : "partidas"}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer text-text focus-visible:outline focus-visible:outline-2">Ver datos</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Campeón</th>
              <th scope="col">Partidas</th>
              <th scope="col">Victorias</th>
              <th scope="col">Winrate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.championName}>
                <td>{c.championName}</td>
                <td>{c.games}</td>
                <td>{c.wins}</td>
                <td>{pct(c.winrate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
