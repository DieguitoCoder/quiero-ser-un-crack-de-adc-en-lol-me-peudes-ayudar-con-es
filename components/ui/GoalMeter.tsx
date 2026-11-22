/**
 * Owner: lumen. Goal progress with a traffic light that never relies on color alone:
 * each status has a distinct icon shape AND a text label, plus "actual vs meta" in words.
 */
import type { GoalMetric, GoalProgress, GoalStatus } from "@/lib/types";
import { cn } from "@/components/ui/cn";

export interface GoalMeterProps {
  /** From lib/coach goals (value null = not enough games). */
  goal: GoalProgress;
  /** Heading level for the goal label (default 3). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const STATUS: Record<GoalStatus, { label: string; text: string; bar: string; ring: string }> = {
  green: { label: "Cumplida", text: "text-win", bar: "bg-win", ring: "border-win/40" },
  yellow: { label: "Cerca", text: "text-warn", bar: "bg-warn", ring: "border-warn/40" },
  red: { label: "Lejos", text: "text-loss", bar: "bg-loss", ring: "border-loss/40" },
  insufficient: { label: "Datos insuficientes", text: "text-muted", bar: "bg-border-strong", ring: "border-border" },
};

function StatusIcon({ status }: { status: GoalStatus }) {
  const common = { stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, fill: "none" };
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0">
      {status === "green" ? (
        <>
          <circle cx="10" cy="10" r="8" {...common} />
          <path d="m6.5 10.2 2.3 2.3 4.7-4.8" {...common} />
        </>
      ) : status === "yellow" ? (
        <>
          <path d="M10 2.5 18 17H2Z" {...common} strokeLinejoin="round" />
          <path d="M10 8v4M10 14.5v.01" {...common} />
        </>
      ) : status === "red" ? (
        <>
          <rect x="2.5" y="2.5" width="15" height="15" rx="2" {...common} />
          <path d="m7 7 6 6M13 7l-6 6" {...common} />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="8" {...common} strokeDasharray="3 3" />
          <path d="M10 14.5v.01M8 8a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1" {...common} />
        </>
      )}
    </svg>
  );
}

const num = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("es", { style: "percent", maximumFractionDigits: 0 });

/** Formats a metric value in Spanish ("6,2", "55 %"). Ratios are 0..1. */
export function formatGoalValue(metric: GoalMetric, value: number): string {
  return metric === "killParticipation" ? pct.format(value) : num.format(value);
}

export function GoalMeter({ goal, headingLevel = 3, className }: GoalMeterProps) {
  const Heading = `h${headingLevel}` as const;
  const s = STATUS[goal.status];
  const progress = Math.min(1, Math.max(0, Number.isFinite(goal.progress) ? goal.progress : 0));
  const sign = goal.comparator === "gte" ? "≥" : "≤";
  const target = `${sign} ${formatGoalValue(goal.metric, goal.target)}`;
  const current = goal.value === null ? "—" : formatGoalValue(goal.metric, goal.value);

  return (
    <div className={cn("rounded-card border bg-surface-2/60 p-4", s.ring, className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Heading className="min-w-0 text-sm font-semibold text-text">
          {goal.label}
          {goal.carried ? <span className="ml-2 text-xs font-normal text-muted">(fase anterior)</span> : null}
        </Heading>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", s.text)}>
          <StatusIcon status={goal.status} />
          {s.label}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`Progreso: ${goal.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={`${s.label}. Actual ${current}, meta ${target}`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-bg"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", s.bar)}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <dl className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted">Actual:</dt>
          <dd className={cn("font-semibold tabular-nums", s.text)}>{current}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Meta:</dt>
          <dd className="font-semibold tabular-nums text-gold">{target}</dd>
        </div>
      </dl>
    </div>
  );
}
