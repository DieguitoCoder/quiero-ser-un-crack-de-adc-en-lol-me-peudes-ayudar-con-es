/** Owner: lumen. Tier/division/LP pill with tier color; null or tierless = "Sin clasificar". */
import { formatRank } from "@/lib/coach/ranks";
import type { RankSnapshot, Tier } from "@/lib/types";
import { cn } from "@/components/ui/cn";

export interface RankBadgeProps {
  /** Any object with tier/division/lp (RankSnapshot, LadderPoint, ...). null = unranked. */
  rank: Pick<RankSnapshot, "tier" | "division" | "lp"> | null;
  size?: "sm" | "md" | "lg";
  /** Optional wins/losses shown as "12V 10D". */
  record?: { wins: number; losses: number };
  className?: string;
}

/** Text + border class per tier (tokens in app/globals.css, all AA on surfaces). */
export const TIER_CLASSES: Record<Tier, string> = {
  IRON: "text-tier-iron border-tier-iron/50",
  BRONZE: "text-tier-bronze border-tier-bronze/50",
  SILVER: "text-tier-silver border-tier-silver/50",
  GOLD: "text-tier-gold border-tier-gold/50",
  PLATINUM: "text-tier-platinum border-tier-platinum/50",
  EMERALD: "text-tier-emerald border-tier-emerald/50",
  DIAMOND: "text-tier-diamond border-tier-diamond/50",
  MASTER: "text-tier-master border-tier-master/50",
  GRANDMASTER: "text-tier-grandmaster border-tier-grandmaster/50",
  CHALLENGER: "text-tier-challenger border-tier-challenger/50",
};

const SIZES = {
  sm: { box: "gap-1.5 px-2 py-0.5 text-xs", gem: "size-3" },
  md: { box: "gap-2 px-3 py-1 text-sm", gem: "size-4" },
  lg: { box: "gap-2.5 px-4 py-1.5 text-base sm:text-lg", gem: "size-5" },
} as const;

export function RankBadge({ rank, size = "md", record, className }: RankBadgeProps) {
  const tier = rank?.tier ?? null;
  const text = rank ? formatRank(rank.tier, rank.division, rank.lp) : "Sin clasificar";
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border bg-surface-2 font-semibold",
        tier ? TIER_CLASSES[tier] : "border-border-strong text-muted",
        s.box,
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className={cn("shrink-0", s.gem)}>
        <path
          d="M8 1 15 8 8 15 1 8Z"
          fill="currentColor"
          fillOpacity={tier ? 0.35 : 0}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span>{text}</span>
      {record ? (
        <span className="font-normal text-muted">
          · {record.wins}V {record.losses}D
        </span>
      ) : null}
    </span>
  );
}
