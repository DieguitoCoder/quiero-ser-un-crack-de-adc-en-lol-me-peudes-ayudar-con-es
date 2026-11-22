/** Owner: lumen. Loading placeholders. Pulse only when motion is allowed. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface SkeletonProps {
  /** Size/shape via Tailwind classes, e.g. "h-4 w-32" or "size-10 rounded-full". */
  className?: string;
}

/** Decorative block, hidden from assistive tech. Wrap groups in <SkeletonGroup> to announce loading. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span aria-hidden="true" className={cn("block rounded-md bg-surface-3/70 motion-safe:animate-pulse", className)} />
  );
}

export interface SkeletonTextProps {
  /** Number of lines (default 3). The last one is shorter. */
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

export interface SkeletonGroupProps {
  /** Screen-reader text (default "Cargando…"). */
  label?: string;
  className?: string;
  children: ReactNode;
}

/** Announces a loading region once (role="status") around decorative skeletons. */
export function SkeletonGroup({ label = "Cargando…", className, children }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
