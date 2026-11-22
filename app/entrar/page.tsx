/** Login: email magic link, optional Riot Sign-On. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MagicLinkForm } from "@/components/features/MagicLinkForm";
import { buttonClasses, Card } from "@/components/ui";
import { getCurrentUser, sanitizeNextPath } from "@/lib/auth";
import { getServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entrar",
  description: "Inicia sesión en Climb Tracker con un enlace por correo o con tu cuenta de Riot.",
};

const ERRORS: Record<string, string> = {
  AUTH_FAILED: "El enlace no es válido o ya caducó. Pide uno nuevo.",
  RSO_FAILED: "No pudimos iniciar sesión con Riot. Inténtalo de nuevo.",
  RSO_DISABLED: "El inicio de sesión con Riot aún no está disponible.",
};

function flags(): { rsoEnabled: boolean; mock: boolean } {
  try {
    const env = getServerEnv();
    return { rsoEnabled: env.rso.enabled, mock: env.authMock };
  } catch {
    return { rsoEnabled: false, mock: false };
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const safeNext = next ? sanitizeNextPath(next) : undefined;
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(safeNext ?? "/");
  const { rsoEnabled, mock } = flags();
  const errorMessage = error ? (ERRORS[error] ?? "No se pudo iniciar sesión. Inténtalo de nuevo.") : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="font-display text-2xl text-gold">Entrar</h1>
      {errorMessage ? (
        <p role="alert" className="rounded-card border border-loss/60 bg-surface-2 p-3 text-sm text-loss">
          {errorMessage}
        </p>
      ) : null}
      <Card title="Con tu correo" description="Te enviamos un enlace de acceso, sin contraseña.">
        <MagicLinkForm next={safeNext} />
      </Card>
      {rsoEnabled ? (
        <Card title="Con Riot">
          <a href={`/api/auth/rso/login${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`} className={buttonClasses({ variant: "secondary" })}>
            Iniciar sesión con Riot
          </a>
        </Card>
      ) : null}
      {mock ? (
        <p className="text-sm text-muted">
          Modo de desarrollo (AUTH_MOCK) activo.{" "}
          <Link href="/" className="text-gold underline">
            Continuar al dashboard
          </Link>
        </p>
      ) : null}
    </div>
  );
}
