/** Owner: lumen. Small inline label. Color is always paired with text. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type BadgeTone = "neutral" | "gold" | "blue" | "win" | "loss" | "warn" | "info";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Optional leading icon (decorative; mark it aria-hidden if it carries no meaning). */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-2 text-muted",
  gold: "border-gold-dark bg-gold-deep/60 text-gold-bright",
  blue: "border-blue-dark/70 bg-blue-deep text-blue-bright",
  win: "border-win/40 bg-win/10 text-win",
  loss: "border-loss/40 bg-loss/10 text-loss",
  warn: "border-warn/40 bg-warn/10 text-warn",
  info: "border-info/40 bg-info/10 text-info",
};

export function Badge({ tone = "neutral", icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
