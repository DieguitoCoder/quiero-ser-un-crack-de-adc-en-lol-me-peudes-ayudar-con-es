/** Owner: lumen. Base surface container. Server-component friendly. */
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface CardProps {
  /** Optional heading rendered at the top of the card. */
  title?: ReactNode;
  /** Secondary line under the title. */
  description?: ReactNode;
  /** Right-aligned header slot (buttons, badges, links). */
  actions?: ReactNode;
  /** Heading level for `title` (default 2). */
  headingLevel?: 2 | 3 | 4;
  /** Semantic element (default "section" when titled, otherwise "div"). */
  as?: "section" | "article" | "div";
  /** Gold accent border for highlighted content. */
  highlight?: boolean;
  /** Remove inner padding (e.g. for edge-to-edge lists); the header keeps its padding. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  description,
  actions,
  headingLevel = 2,
  as,
  highlight = false,
  flush = false,
  className,
  children,
}: CardProps) {
  const Tag = as ?? (title ? "section" : "div");
  const Heading = `h${headingLevel}` as const;
  const hasHeader = Boolean(title || description || actions);
  return (
    <Tag
      className={cn(
        "rounded-card border bg-surface/90 shadow-card",
        highlight ? "border-gold-dark" : "border-border",
        !flush && "p-4 sm:p-5",
        className,
      )}
    >
      {hasHeader ? (
        <header
          className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", flush && "px-4 pt-4 sm:px-5 sm:pt-5")}
        >
          <div className="min-w-0">
            {title ? (
              <Heading className="font-display text-base font-semibold tracking-wide text-gold sm:text-lg">
                {title}
              </Heading>
            ) : null}
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
