/** Public read-only player page. Segment is "Name-TAG" (split on the LAST "-"). */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { EmptyState, ErrorState, MatchRow, RankBadge, Card } from "@/components/ui";
import { searchPlayer } from "@/lib/services/v2";

export const dynamic = "force-dynamic";

function parseSegment(segment: string): { name: string; tag: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const i = decoded.lastIndexOf("-");
  if (i < 1 || i === decoded.length - 1) return null;
  return { name: decoded.slice(0, i), tag: decoded.slice(i + 1) };
}

export async function generateMetadata({ params }: { params: Promise<{ riotId: string }> }): Promise<Metadata> {
  const parsed = parseSegment((await params).riotId);
  if (!parsed) return { title: "Jugador", robots: { index: false } };
  const label = `${parsed.name}#${parsed.tag}`;
  return {
    title: `${label} · Perfil`,
    description: `Rango, historial y últimas partidas de ${label} en League of Legends.`,
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ riotId: string }> }) {
  const parsed = parseSegment((await params).riotId);
  if (!parsed) {
    return <ErrorState title="Riot ID no válido" message="Usa el formato Nombre#TAG en el buscador." />;
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const result = await searchPlayer(`${parsed.name}#${parsed.tag}`, ip).catch(() => null);
  if (!result) return <ErrorState message="No se pudo buscar al jugador. Recarga la página." />;
  if (!result.ok) {
    return (
      <ErrorState
        title={result.error.code === "SUMMONER_NOT_FOUND" ? "Jugador no encontrado" : undefined}
        message={result.error.message}
        code={result.error.code}
      />
    );
  }
  const { player, rank, recent, lastSyncAt } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-gold">
          {player.gameName}
          <span className="text-muted">#{player.tagLine}</span>
        </h1>
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            Solo/Dúo
            <RankBadge rank={rank.solo} record={rank.solo ? { wins: rank.solo.wins, losses: rank.solo.losses } : undefined} />
          </span>
          <span className="flex items-center gap-2 text-sm text-muted">
            Flex
            <RankBadge rank={rank.flex} record={rank.flex ? { wins: rank.flex.wins, losses: rank.flex.losses } : undefined} />
          </span>
        </div>
        {lastSyncAt ? (
          <p className="text-xs text-muted">Actualizado: {new Date(lastSyncAt).toLocaleString("es")}</p>
        ) : null}
      </div>
      <Card title="Últimas partidas" headingLevel={2}>
        {recent.length === 0 ? (
          <EmptyState title="Sin partidas guardadas" description="Aún no tenemos partidas de este jugador." headingLevel={3} />
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((m) => (
              <li key={m.matchId}>
                <MatchRow match={m} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
