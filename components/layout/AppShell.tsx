"use client";
/** Header + primary navigation (keyboard accessible) + main landmark. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PlayerSearch } from "@/components/features/PlayerSearch";
import { SiteFooter } from "@/components/layout/SiteFooter";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/partidas", label: "Partidas" },
  { href: "/metas", label: "Metas" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

export function AppShell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-bg"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-border bg-surface/95">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="font-display text-xl font-semibold tracking-wide text-gold">Climb Tracker</p>
          <nav aria-label="Principal">
            <ul className="flex flex-wrap gap-1">
              {(signedIn ? NAV : ([{ href: "/entrar", label: "Entrar" }] as const)).map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                        active ? "bg-surface-3 text-gold-bright" : "text-muted hover:text-text"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <PlayerSearch />
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-5xl px-4 py-6">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
