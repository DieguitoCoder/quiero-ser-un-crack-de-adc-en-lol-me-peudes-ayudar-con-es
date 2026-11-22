"use client";
/** Header search: Name#TAG -> /jugador/Name-TAG. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function PlayerSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const v = value.trim();
    const i = v.lastIndexOf("#");
    if (i < 1 || i === v.length - 1) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    router.push(`/jugador/${encodeURIComponent(`${v.slice(0, i)}-${v.slice(i + 1)}`)}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="flex items-center gap-2">
      <label htmlFor="player-search" className="sr-only">
        Buscar jugador (Nombre#TAG)
      </label>
      <input
        id="player-search"
        type="search"
        placeholder="Buscar Nombre#TAG"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? "player-search-error" : undefined}
        className="min-h-11 w-40 rounded-md border border-border bg-surface-2 px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold sm:w-52"
      />
      <button
        type="submit"
        className="min-h-11 rounded-md border border-border px-3 text-sm text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        Buscar
      </button>
      {invalid ? (
        <span id="player-search-error" role="alert" className="text-xs text-loss">
          Usa Nombre#TAG
        </span>
      ) : null}
    </form>
  );
}
