/** getGoals() from lib/services. */
import type { Metadata } from "next";
import { Card, EmptyState, ErrorState, GoalMeter } from "@/components/ui";
import { getGoals } from "@/lib/services";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Metas" };

const PHASES = [
  { name: "Bronce", text: "Hasta Bronce: mejora el CS por minuto y reduce las muertes." },
  { name: "Plata", text: "En Plata: mantén lo anterior y compra más control wards." },
  { name: "Oro", text: "En Oro: sube tu participación en kills y sigue limitando las muertes." },
  { name: "Platino", text: "Platino es el destino final: llegar con estos hábitos ya consolidados." },
] as const;

export default async function GoalsPage() {
  const result = await getGoals().catch(() => null);
  if (!result) return <ErrorState message="No se pudieron leer las metas. Recarga la página." />;
  if (!result.ok) return <ErrorState message={result.error.message} code={result.error.code} />;
  const g = result.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">Metas</h1>
      <Card
        title={`Fase actual: ${g.phase}`}
        description={`Calculado con tus últimas ${g.sampleSize} de ${g.windowSize} partidas (mínimo ${g.minSample}).`}
      >
        {g.goals.length === 0 ? (
          <EmptyState title="Sin metas" description="Sincroniza partidas para evaluar tus metas." headingLevel={3} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.goals.map((goal) => (
              <li key={goal.id}>
                <GoalMeter goal={goal} headingLevel={3} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Las fases" description="Bronce → Plata → Oro → Platino">
        <ol className="flex flex-col gap-2 text-sm">
          {PHASES.map((p) => (
            <li key={p.name}>
              <strong className="text-gold">{p.name}.</strong> {p.text}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
