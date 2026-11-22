"use client";
/** PUT /api/journal/[matchId] with JournalInput, then router.refresh(). */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import {
  DEATH_REASONS,
  DEATH_REASON_LABELS,
  type ApiErrorBody,
  type DeathReason,
  type JournalEntry,
  type JournalInput,
  type TiltLevel,
} from "@/lib/types";

export interface JournalFormProps {
  matchId: string;
  initial: JournalEntry | null;
}

const TILT_LEVELS: readonly TiltLevel[] = [1, 2, 3, 4, 5];
const LESSON_MAX = 1000;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export function JournalForm({ matchId, initial }: JournalFormProps) {
  const router = useRouter();
  const [reasons, setReasons] = useState<DeathReason[]>(initial?.deathReasons ?? []);
  const [lesson, setLesson] = useState(initial?.lesson ?? "");
  const [tilt, setTilt] = useState<TiltLevel | null>(initial?.tilt ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function toggleReason(r: DeathReason): void {
    setSaved(false);
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (lesson.length > LESSON_MAX) {
      setFieldErrors({ lesson: `La lección no puede superar ${LESSON_MAX} caracteres.` });
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});
    const input: JournalInput = { deathReasons: reasons, lesson: lesson.trim(), tilt };
    try {
      const res = await fetch(`/api/journal/${encodeURIComponent(matchId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error.message);
        setFieldErrors(body.error.fields ?? {});
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("No se pudo guardar el diario. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Diario de la partida" className="flex flex-col gap-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-text">Motivos de tus muertes</legend>
        <div className="flex flex-wrap gap-2">
          {DEATH_REASONS.map((r) => (
            <label
              key={r}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-text has-[:checked]:border-gold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold"
            >
              <input
                type="checkbox"
                checked={reasons.includes(r)}
                onChange={() => toggleReason(r)}
                className="size-4 accent-[var(--color-gold)]"
              />
              {DEATH_REASON_LABELS[r]}
            </label>
          ))}
        </div>
        {fieldErrors.deathReasons ? <p className="mt-1 text-sm text-loss">{fieldErrors.deathReasons}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="journal-lesson" className="mb-1 block text-sm font-medium text-text">
          Lección aprendida
        </label>
        <textarea
          id="journal-lesson"
          rows={4}
          value={lesson}
          onChange={(e) => {
            setSaved(false);
            setLesson(e.target.value);
          }}
          aria-invalid={Boolean(fieldErrors.lesson)}
          aria-describedby="journal-lesson-help"
          className={`w-full rounded-md border border-border bg-surface-2 p-3 text-text ${focusRing}`}
        />
        <p id="journal-lesson-help" className={`mt-1 text-xs ${fieldErrors.lesson ? "text-loss" : "text-muted"}`}>
          {fieldErrors.lesson ?? `${lesson.length}/${LESSON_MAX} caracteres`}
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-text">Tilt (1 = tranquilo, 5 = muy tiltado)</legend>
        <div className="flex flex-wrap gap-2">
          {TILT_LEVELS.map((n) => (
            <label
              key={n}
              className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-2 text-text has-[:checked]:border-gold has-[:checked]:bg-gold-deep has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold"
            >
              <input
                type="radio"
                name="tilt"
                value={n}
                checked={tilt === n}
                onChange={() => {
                  setSaved(false);
                  setTilt(n);
                }}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
        {fieldErrors.tilt ? <p className="mt-1 text-sm text-loss">{fieldErrors.tilt}</p> : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" loading={saving} loadingText="Guardando…">
            Guardar diario
          </Button>
        </div>
        <div aria-live="polite" className="text-sm">
          {saved ? <p className="text-win">Diario guardado.</p> : null}
          {error ? (
            <p role="alert" className="text-loss">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
