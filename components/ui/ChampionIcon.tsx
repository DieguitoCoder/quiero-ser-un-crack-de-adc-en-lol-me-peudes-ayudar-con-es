/**
 * Owner: lumen. Champion portrait from Data Dragon (plain <img>: no next.config remotePatterns needed).
 * Accepts match-v5 ids ("MissFortune", "MonkeyKing") or display names ("Miss Fortune", "Kai'Sa").
 * If the image fails, the dark background + alt text remain (no client JS needed).
 */
import { championDisplayName, championIconUrl } from "@/lib/ddragon";
import { cn } from "@/components/ui/cn";

export interface ChampionIconProps {
  championName: string;
  /** Pixel size (square). Default 40. */
  size?: number;
  /** Override alt text. Pass "" when the name is already shown next to the icon. */
  alt?: string;
  /** Gold frame (default true). */
  framed?: boolean;
  className?: string;
}

export function ChampionIcon({ championName, size = 40, alt, framed = true, className }: ChampionIconProps) {
  const src = championIconUrl(championName);
  const label = alt ?? championDisplayName(championName);
  const frame = cn(
    "shrink-0 rounded-md bg-surface-3 object-cover",
    framed && "border border-gold-dark",
    className,
  );

  if (!src) {
    return (
      <span
        role={label ? "img" : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
        className={cn(frame, "inline-flex items-center justify-center text-xs font-semibold text-muted")}
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- plain img keeps next.config untouched; icons are tiny static PNGs
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={frame}
      style={{ width: size, height: size }}
    />
  );
}
