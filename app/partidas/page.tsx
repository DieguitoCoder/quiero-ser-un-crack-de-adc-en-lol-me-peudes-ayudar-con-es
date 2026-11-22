/** listMatches({ champion, limit, offset }) from lib/services. */
import type { Metadata } from "next";
import { ChampionFilter } from "@/components/features/ChampionFilter";
import { EmptyState, ErrorState, MatchRow } from "@/components/ui";
import { listMatches } from "@/lib/services";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partidas" };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ champion?: string | string[] }> }) {
  const { champion: raw } = await searchParams;
  const champion = (Array.isArray(raw) ? raw[0] : raw) || undefined;
  const result = await listMatches({ champion, limit: 50, offset: 0 }).catch(() => null);
  if (!result) return <ErrorState message="No se pudieron leer las partidas locales. Recarga la página." />;
  if (!result.ok) return <ErrorState message={result.error.message} code={result.error.code} />;
  const { items, total, champions } = result.data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-gold">Partidas</h1>
      {champions.length === 0 ? (
        <EmptyState title="Aún no hay partidas" description="Ve a Ajustes y sincroniza para traer tus partidas." />
      ) : (
        <>
          <ChampionFilter champions={champions} selected={champion} />
          <p className="text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "partida" : "partidas"}
            {champion ? ` con ${champion}` : ""}
            {total > items.length ? ` (mostrando ${items.length})` : ""}
          </p>
          {items.length === 0 ? (
            <EmptyState title="Sin resultados" description="No hay partidas con ese campeón." headingLevel={2} />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((m) => (
                <li key={m.matchId}>
                  <MatchRow match={m} href={`/partidas/${m.matchId}`} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
