/**
 * Owner: lumen. One match in a list, as a single link (whole row clickable).
 * Wrap rows in <ul role="list"><li>…</li></ul>. Result is shown as text ("Victoria"/"Derrota"/"Remake"), not only color.
 */
import Link from "next/link";
import type { MatchSummary } from "@/lib/types";
import { championDisplayName } from "@/lib/ddragon";
import { ChampionIcon } from "@/components/ui/ChampionIcon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { queueInfo } from "@/lib/queues";

export interface MatchRowProps {
  match: MatchSummary & { queueId?: number; placement?: number | null };
  /** Detail page, e.g. `/partidas/${match.matchId}`. Omit for a non-link row (public pages). */
  href?: string;
  className?: string;
}

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const dateTimeFmt = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });
const dec1 = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MatchRow({ match, href, className }: MatchRowProps) {
  const result = match.isRemake ? "remake" : match.win ? "win" : "loss";
  const resultLabel = result === "remake" ? "Remake" : result === "win" ? "Victoria" : "Derrota";
  const champion = championDisplayName(match.championName);
  const opponent = match.opponentChampionName ? championDisplayName(match.opponentChampionName) : null;
  const date = new Date(match.gameCreation);

  const classes = cn(

        "group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/80 p-3",
        "border-l-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-bright",
        "sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:gap-x-4",
        result === "win" ? "border-l-win" : result === "loss" ? "border-l-loss" : "border-l-border-strong",
        className,
  );
  const content = (
    <>
      <ChampionIcon championName={match.championName} size={44} alt="" />

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-text">{champion}</span>
          <Badge tone={result === "win" ? "win" : result === "loss" ? "loss" : "neutral"}>{resultLabel}</Badge>
          {match.queueId !== undefined ? <Badge tone="neutral">{queueInfo(match.queueId).label}</Badge> : null}
          {match.placement ? <Badge tone="gold">Puesto {match.placement}</Badge> : null}
          {match.hasJournal ? (
            <Badge tone="gold">
              <span className="sr-only">Tiene </span>Nota
            </Badge>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted">
          {opponent ? <>vs. {opponent}</> : "Rival desconocido"}
          <span aria-hidden="true"> · </span>
          <time dateTime={date.toISOString()} title={dateTimeFmt.format(date)}>
            {dateFmt.format(date)}
          </time>
          <span aria-hidden="true"> · </span>
          <span>
            <span className="sr-only">Duración </span>
            {formatDuration(match.gameDurationS)}
          </span>
        </p>
      </div>

      <dl className="col-span-3 col-start-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs sm:col-span-1 sm:col-start-auto sm:text-sm">
        <div className="flex gap-1">
          <dt className="sr-only">Asesinatos, muertes y asistencias</dt>
          <dd className="font-semibold tabular-nums text-text">
            {match.kills}/<span className="text-loss">{match.deaths}</span>/{match.assists}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">KDA</dt>
          <dd className="tabular-nums text-text">{dec1.format(match.kda)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">CS/min</dt>
          <dd className="tabular-nums text-text">{dec1.format(match.csPerMin)}</dd>
        </div>
      </dl>

      <span
        aria-hidden="true"
        className="col-start-3 row-start-1 text-lg text-gold transition-transform duration-150 group-hover:translate-x-0.5 sm:col-start-4"
      >
        ›
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  );
}
