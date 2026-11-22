/**
 * Owner: lumen. Button with variants and loading state.
 * No "use client": it has no hooks, so it renders anywhere; pass onClick only from client components.
 * For navigation, apply `buttonClasses()` to a next/link <Link>.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  /** Label shown while loading, e.g. "Sincronizando…" (default: keeps children). */
  loadingText?: string;
  /** Optional leading icon (decorative). */
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-gold bg-gradient-to-b from-gold-bright to-gold text-bg hover:to-gold-bright hover:shadow-glow-gold",
  secondary: "border-blue-dark bg-blue-deep text-blue-bright hover:border-blue hover:shadow-glow-blue",
  ghost: "border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger: "border-loss/60 bg-loss/10 text-loss hover:bg-loss/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 px-3 text-sm",
  md: "min-h-11 gap-2 px-4 text-sm",
  lg: "min-h-12 gap-2 px-6 text-base",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Shared classes so links can look like buttons. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded-md border font-semibold tracking-wide",
    "transition-[background-color,box-shadow,color,border-color] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-bright",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

/** Decorative spinner; stops spinning under prefers-reduced-motion. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4 shrink-0 motion-safe:animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  icon,
  fullWidth = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}
