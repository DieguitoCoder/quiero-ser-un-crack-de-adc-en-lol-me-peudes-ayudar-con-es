/** listMatchesV2 with mode + champion filters. */
import type { Metadata } from "next";
import { ChampionFilter } from "@/components/features/ChampionFilter";
import { gatePrivate } from "@/components/features/gate";
import { ModeFilter, parseMode } from "@/components/features/ModeFilter";
import { EmptyState, ErrorState, MatchRow } from "@/components/ui";
import { listMatchesV2 } from "@/lib/services/v2";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partidas" };

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ champion?: string | string[]; queue?: string | string[] }>;
}) {
  const sp = await searchParams;
  const queue = parseMode(sp.queue, "all");
  const champion = (Array.isArray(sp.champion) ? sp.champion[0] : sp.champion) || undefined;
  const gate = await gatePrivate("/partidas");
  if (!gate.viewer) return gate.node;

  const result = await listMatchesV2(gate.viewer, { queue, champion, limit: 50, offset: 0 }).catch(() => null);
  if (!result) return <ErrorState message="No se pudieron leer las partidas. Recarga la página." />;
  if (!result.ok) return <ErrorState message={result.error.message} code={result.error.code} />;
  const { items, total, champions } = result.data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-gold">Partidas</h1>
      <ModeFilter basePath="/partidas" selected={queue} params={{ champion }} />
      {champions.length === 0 && !champion ? (
        <EmptyState title="Aún no hay partidas en este modo" description="Sincroniza desde el Dashboard o prueba con otro modo." />
      ) : (
        <>
          <ChampionFilter champions={champions} selected={champion} />
          <p className="text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "partida" : "partidas"}
            {champion ? ` con ${champion}` : ""}
            {total > items.length ? ` (mostrando ${items.length})` : ""}
          </p>
          {items.length === 0 ? (
            <EmptyState title="Sin resultados" description="No hay partidas con ese filtro." headingLevel={2} />
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
