/** Owner: lumen. KPI tile: label, big value, optional hint and trend. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type StatTone = "neutral" | "good" | "warn" | "bad";

export interface StatTrend {
  direction: "up" | "down" | "flat";
  /** Visible text, e.g. "+0,4 vs. últimas 20". Required so meaning is not arrow/color only. */
  label: string;
  /** Whether this change is good for the player (deaths going down is good). Default: up = good. */
  positive?: boolean;
}

export interface StatCardProps {
  /** e.g. "CS por minuto" */
  label: string;
  /** Pre-formatted value, e.g. "6,2" or "54 %". */
  value: ReactNode;
  /** Small helper text under the value, e.g. "Meta: 6+". */
  hint?: ReactNode;
  /** Color of the value. Default "neutral". */
  tone?: StatTone;
  trend?: StatTrend;
  className?: string;
}

const TONE_TEXT: Record<StatTone, string> = {
  neutral: "text-text",
  good: "text-win",
  warn: "text-warn",
  bad: "text-loss",
};

const ARROWS: Record<StatTrend["direction"], string> = { up: "▲", down: "▼", flat: "■" };

export function StatCard({ label, value, hint, tone = "neutral", trend, className }: StatCardProps) {
  const trendGood = trend ? (trend.positive ?? trend.direction === "up") : false;
  const trendClass = !trend || trend.direction === "flat" ? "text-muted" : trendGood ? "text-win" : "text-loss";
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-card border border-border bg-surface/90 p-4 shadow-card",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/60 before:to-transparent",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("font-display text-2xl font-semibold tabular-nums sm:text-3xl", TONE_TEXT[tone])}>{value}</p>
      {trend ? (
        <p className={cn("flex items-center gap-1 text-xs font-medium", trendClass)}>
          <span aria-hidden="true">{ARROWS[trend.direction]}</span>
          <span>{trend.label}</span>
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
