import type { Metadata } from "next";
import { DraftBanner } from "@/components/layout/DraftBanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos guarda Climb Tracker, para qué los usa y cómo puedes borrarlos.",
};

export default function PrivacyPage() {
  return (
    <article className="flex max-w-3xl flex-col gap-4 text-sm leading-relaxed">
      <DraftBanner />
      <h1 className="font-display text-2xl text-gold">Política de privacidad</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Qué datos guardamos</h2>
        <ul className="list-disc pl-5">
          <li>Tu correo electrónico (para iniciar sesión con enlace mágico).</li>
          <li>Tu PUUID y tu Riot ID (nombre#tag) y región, al vincular tu cuenta de Riot.</li>
          <li>Datos de tus partidas obtenidos de la API de Riot Games (campeón, resultado, estadísticas, rango).</li>
          <li>Tu diario personal de cada partida (motivos de muerte, lecciones, nivel de tilt).</li>
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Para qué los usamos</h2>
        <p>
          Mostrarte tus estadísticas, historial de LP, consejos del coach y metas. No vendemos tus datos ni los usamos
          para publicidad.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Datos públicos</h2>
        <p>
          Las partidas y el rango asociados a un Riot ID son datos públicos de Riot y pueden verse en la búsqueda de
          jugadores. Tu diario y tu correo son privados.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Borrado</h2>
        <p>
          Puedes borrar tu cuenta en cualquier momento desde Cuenta. Se eliminan tu perfil, tu Riot ID vinculado, tu diario
          y tu usuario de acceso. Los datos públicos de partidas compartidas pueden conservarse.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-text">Contacto</h2>
        <p>[Pendiente: correo de contacto del responsable]</p>
      </section>
    </article>
  );
}
