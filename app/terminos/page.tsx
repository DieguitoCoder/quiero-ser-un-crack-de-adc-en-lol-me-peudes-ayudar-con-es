import type { Metadata } from "next";
import { DraftBanner } from "@/components/layout/DraftBanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Condiciones de uso de Climb Tracker.",
};

export default function TermsPage() {
  return (
    <article className="flex max-w-3xl flex-col gap-4 text-sm leading-relaxed">
      <DraftBanner />
      <h1 className="font-display text-2xl text-gold">Términos de uso</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">El servicio</h2>
        <p>
          Climb Tracker es una herramienta gratuita e independiente para seguir tu progreso en League of Legends. No está
          afiliada a Riot Games. Se ofrece &quot;tal cual&quot;, sin garantías de disponibilidad ni exactitud.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Tu cuenta</h2>
        <p>
          Eres responsable de la cuenta de correo con la que entras y del Riot ID que vinculas. No vincules cuentas ajenas
          ni uses el servicio para acosar a otros jugadores ni para automatizar peticiones abusivas.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Contenido de Riot</h2>
        <p>
          Los datos de juego pertenecen a Riot Games y se obtienen con su API pública, sujetos a sus políticas. Podemos
          limitar la sincronización para respetar los límites de Riot.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Cambios y contacto</h2>
        <p>Podemos actualizar estos términos. Contacto: [Pendiente: correo de contacto del responsable]</p>
      </section>
    </article>
  );
}
