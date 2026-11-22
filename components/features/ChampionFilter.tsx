"use client";
/** Updates ?champion= keeping the current ?queue=. */
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ChampionFilterProps {
  champions: string[];
  selected?: string;
}

export function ChampionFilter({ champions, selected }: ChampionFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="champion-filter" className="text-sm text-muted">
        Campeón
      </label>
      <select
        id="champion-filter"
        value={selected ?? ""}
        onChange={(e) => {
          const qs = new URLSearchParams(search.toString());
          if (e.target.value) qs.set("champion", e.target.value);
          else qs.delete("champion");
          const s = qs.toString();
          router.push(s ? `${pathname}?${s}` : pathname);
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
