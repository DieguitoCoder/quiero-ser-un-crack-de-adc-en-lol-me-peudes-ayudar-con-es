/** Owner: lumen. "No data yet" placeholder with optional call to action. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface EmptyStateProps {
  /** e.g. "Aún no hay partidas" */
  title: string;
  /** e.g. "Sincroniza para traer tus últimas partidas de SoloQ." */
  description?: ReactNode;
  /** Usually a <Button> or a link styled with buttonClasses(). */
  action?: ReactNode;
  /** Decorative icon; defaults to a hextech diamond. */
  icon?: ReactNode;
  /** Heading level (default 2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function HexIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className={cn("size-12", className)}>
      <path d="M24 4 42 24 24 44 6 24Z" stroke="currentColor" strokeWidth="2" />
      <path d="M24 14 32 24 24 34 16 24Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function EmptyState({ title, description, action, icon, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface/60 px-4 py-10 text-center",
        className,
      )}
    >
      <span className="text-gold">{icon ?? <HexIcon />}</span>
      <Heading className="font-display text-lg font-semibold text-text">{title}</Heading>
      {description ? <p className="max-w-prose text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
