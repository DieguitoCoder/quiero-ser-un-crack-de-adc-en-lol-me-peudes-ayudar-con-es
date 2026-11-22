/** Footer with Riot legal boilerplate; rendered on every page. */
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-border bg-surface/95">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-muted">
        <p>
          Climb Tracker isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or
          anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated
          properties are trademarks or registered trademarks of Riot Games, Inc.
        </p>
        <nav aria-label="Legal">
          <ul className="flex gap-4">
            <li>
              <Link href="/privacidad" className="underline hover:text-text">
                Privacidad
              </Link>
            </li>
            <li>
              <Link href="/terminos" className="underline hover:text-text">
                Términos
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
