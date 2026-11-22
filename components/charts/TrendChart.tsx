/** Hand-rolled SVG: CS/min or deaths per game + 5-game moving average, optional target line. */
import type { TrendPoint } from "@/lib/types";

export interface TrendChartProps {
  points: TrendPoint[];
  metric: "csPerMin" | "deaths";
  target?: number;
}

const W = 600;
const H = 220;
const PAD = { l: 36, r: 16, t: 16, b: 28 };
const RAW = "#8d9ab0";
const MA = "#f0d595";
const TARGET = "#6cb4f0";
const GRID = "#2a3e60";
const TEXT = "#a9b4c6";
const MAX_POINTS = 30;

export function TrendChart({ points, metric, target }: TrendChartProps) {
  const isCs = metric === "csPerMin";
  const title = isCs ? "CS por minuto" : "Muertes por partida";
  const data = points.slice(-MAX_POINTS);
  if (data.length < 2) {
    return (
      <figure>
        <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
        <p className="text-sm text-muted">Se necesitan al menos 2 partidas para mostrar la tendencia.</p>
      </figure>
    );
  }
  const raw = (p: TrendPoint): number => (isCs ? p.csPerMin : p.deaths);
  const ma = (p: TrendPoint): number | null => (isCs ? p.csPerMinMa5 : p.deathsMa5);
  const values = data.flatMap((p) => [raw(p), ma(p) ?? raw(p)]);
  if (target !== undefined) values.push(target);
  const hi = Math.max(1, Math.ceil(Math.max(...values) * 1.1));
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const rawPath = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(raw(p)).toFixed(1)}`).join(" ");
  let started = false;
  const maPath = data
    .map((p, i) => {
      const v = ma(p);
      if (v === null) return "";
      const cmd = started ? "L" : "M";
      started = true;
      return `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    })
    .join(" ");
  const fmt = (v: number): string => v.toFixed(isCs ? 1 : 0);
  const id = `trend-${metric}`;
  const lastMa = [...data]
    .reverse()
    .map(ma)
    .find((v) => v !== null);
  const ticks = [0, hi / 2, hi];

  return (
    <figure>
      <figcaption className="mb-2 font-display text-gold">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>
          Últimas {data.length} partidas.
          {lastMa != null ? ` Media móvil de 5 partidas: ${fmt(lastMa)}.` : ""}
          {target !== undefined ? ` Objetivo: ${target}.` : ""}
        </desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray="3 3" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={TEXT}>
              {Number(t.toFixed(1))}
            </text>
          </g>
        ))}
        {target !== undefined ? (
          <g>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(target)}
              y2={y(target)}
              stroke={TARGET}
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text x={W - PAD.r} y={y(target) - 4} textAnchor="end" fontSize="11" fill={TARGET}>
              Objetivo {target}
            </text>
          </g>
        ) : null}
        <path d={rawPath} fill="none" stroke={RAW} strokeWidth="1.5" />
        {data.map((p, i) => (
          <circle key={p.matchId} cx={x(i)} cy={y(raw(p))} r="3" fill={RAW} />
        ))}
        {maPath ? <path d={maPath} fill="none" stroke={MA} strokeWidth="3" strokeLinejoin="round" /> : null}
        <text x={PAD.l} y={H - 8} fontSize="11" fill={TEXT}>
          Más antigua
        </text>
        <text x={W - PAD.r} y={H - 8} fontSize="11" textAnchor="end" fill={TEXT}>
          Más reciente
        </text>
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>
          <span aria-hidden style={{ color: RAW }}>●</span> Partida
        </span>
        <span>
          <span aria-hidden style={{ color: MA }}>━</span> Media 5 partidas
        </span>
        {target !== undefined ? (
          <span>
            <span aria-hidden style={{ color: TARGET }}>┅</span> Objetivo
          </span>
        ) : null}
      </p>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer text-text focus-visible:outline focus-visible:outline-2">Ver datos</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title} por partida</caption>
          <thead>
            <tr>
              <th scope="col">Campeón</th>
              <th scope="col">Valor</th>
              <th scope="col">Media 5</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const m = ma(p);
              return (
                <tr key={p.matchId}>
                  <td>{p.championName}</td>
                  <td>{fmt(raw(p))}</td>
                  <td>{m === null ? "—" : fmt(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
