/** Owner: lumen. Error panel, announced to screen readers (role="alert"). */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface ErrorStateProps {
  /** Default "Algo salió mal". */
  title?: string;
  /** Spanish user-facing message (e.g. ApiError.message). */
  message?: ReactNode;
  /** Optional technical code shown in small mono text (e.g. "RIOT_RATE_LIMITED"). */
  code?: string;
  /** Retry button/link. */
  action?: ReactNode;
  /** Heading level (default 2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function ErrorState({
  title = "Algo salió mal",
  message,
  code,
  action,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-loss/40 bg-loss/5 p-4 sm:flex-row sm:items-start sm:p-5",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6 shrink-0 text-loss">
        <path d="M12 3 22 20H2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 10v4M12 17v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="min-w-0 flex-1">
        <Heading className="font-semibold text-loss">{title}</Heading>
        {message ? <p className="mt-1 text-sm text-text">{message}</p> : null}
        {code ? <p className="mt-2 font-mono text-xs text-subtle">Código: {code}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
