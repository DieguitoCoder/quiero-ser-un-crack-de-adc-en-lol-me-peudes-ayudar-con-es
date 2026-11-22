"use client";
/** Updates ?champion= on /partidas. */
import { usePathname, useRouter } from "next/navigation";

export interface ChampionFilterProps {
  champions: string[];
  selected?: string;
}

export function ChampionFilter({ champions, selected }: ChampionFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="champion-filter" className="text-sm text-muted">
        Campeón
      </label>
      <select
        id="champion-filter"
        value={selected ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          router.push(value ? `${pathname}?champion=${encodeURIComponent(value)}` : pathname);
        }}
        className="min-h-11 rounded-md border border-border bg-surface-2 px-3 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <option value="">Todos</option>
        {champions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
