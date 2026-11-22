"use client";
/** PUT /api/me/riot-id. Name#TAG + platform; Spanish field/API errors. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import type { ApiErrorBody } from "@/lib/types";

const PLATFORMS = [
  { value: "la1", label: "LAN (la1)" },
  { value: "la2", label: "LAS (la2)" },
  { value: "na1", label: "Norteamérica (na1)" },
  { value: "br1", label: "Brasil (br1)" },
  { value: "euw1", label: "EU Oeste (euw1)" },
  { value: "eun1", label: "EU Nórdica y Este (eun1)" },
  { value: "tr1", label: "Turquía (tr1)" },
  { value: "kr", label: "Corea (kr)" },
  { value: "jp1", label: "Japón (jp1)" },
  { value: "oc1", label: "Oceanía (oc1)" },
] as const;

const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

export function LinkRiotIdForm({ initialRiotId = "" }: { initialRiotId?: string }) {
  const router = useRouter();
  const [riotId, setRiotId] = useState(initialRiotId);
  const [platform, setPlatform] = useState("la1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!/^[^#]{1,16}#[^#\s]{2,5}$/.test(riotId.trim())) {
      setError("Escribe tu Riot ID con el formato Nombre#TAG (ej. Faker#LAN).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/me/riot-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId: riotId.trim(), platform }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      const code = body?.error.code;
      setError(
        code === "RIOT_ID_TAKEN"
          ? "Ese Riot ID ya está verificado por otra cuenta."
          : code === "SUMMONER_NOT_FOUND"
            ? "No encontramos ese Riot ID. Revisa el nombre, el tag y la región."
            : (body?.error.message ?? "No se pudo vincular el Riot ID."),
      );
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="riot-id" className="text-sm text-muted">
          Riot ID (Nombre#TAG)
        </label>
        <input
          id="riot-id"
          name="riotId"
          type="text"
          autoComplete="off"
          required
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "riot-id-error" : undefined}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="platform" className="text-sm text-muted">
          Región
        </label>
        <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p id="riot-id-error" role="alert" className="text-sm text-loss">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={loading} loadingText="Vinculando…">
          Vincular Riot ID
        </Button>
      </div>
    </form>
  );
}
