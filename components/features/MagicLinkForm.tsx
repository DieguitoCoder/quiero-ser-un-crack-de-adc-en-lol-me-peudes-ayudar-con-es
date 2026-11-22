"use client";
/** POST /api/auth/magic-link. */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import type { ApiErrorBody } from "@/lib/types";

export function MagicLinkForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      setError(body?.error.fields?.email ?? body?.error.message ?? "No se pudo enviar el enlace.");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="rounded-card border border-win bg-surface-2 p-4 text-sm text-text">
        Te enviamos un enlace a <strong>{email}</strong>. Ábrelo desde ese correo para entrar (revisa también spam).
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm text-muted">
        Correo electrónico
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "email-error" : undefined}
        className="min-h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      />
      {error ? (
        <p id="email-error" role="alert" className="text-sm text-loss">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={loading} loadingText="Enviando…">
          Enviarme un enlace de acceso
        </Button>
      </div>
    </form>
  );
}
