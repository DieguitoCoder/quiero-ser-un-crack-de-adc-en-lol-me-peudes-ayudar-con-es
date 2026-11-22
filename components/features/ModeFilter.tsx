/** Mode chips (links) that set ?queue= and keep other params. Server-renderable. */
import Link from "next/link";

const MODE_CHIPS = [
  { value: "all", label: "Todas" },
  { value: "420", label: "SoloQ" },
  { value: "440", label: "Flex" },
  { value: "400", label: "Reclutamiento" },
  { value: "normal", label: "Normales" },
  { value: "aram", label: "ARAM" },
  { value: "arena", label: "Arena" },
  { value: "other", label: "Otros" },
] as const;

/** Returns a valid chip value or the fallback. */
export function parseMode(raw: string | string[] | undefined, fallback: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return MODE_CHIPS.some((c) => c.value === v) ? (v as string) : fallback;
}

export interface ModeFilterProps {
  basePath: string;
  selected: string;
  /** extra params to preserve (e.g. champion) */
  params?: Record<string, string | undefined>;
}

export function ModeFilter({ basePath, selected, params = {} }: ModeFilterProps) {
  return (
    <nav aria-label="Modo de juego">
      <ul className="flex flex-wrap gap-2">
        {MODE_CHIPS.map((c) => {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
          qs.set("queue", c.value);
          const active = c.value === selected;
          return (
            <li key={c.value}>
              <Link
                href={`${basePath}?${qs.toString()}`}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                  active ? "border-gold bg-surface-3 text-gold-bright" : "border-border text-muted hover:text-text"
                }`}
              >
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
