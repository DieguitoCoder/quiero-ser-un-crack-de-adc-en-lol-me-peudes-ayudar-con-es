/**
 * Request validation (zod) for app/api/**. Owner: cobalt.
 * Schemas are tied to lib/types.ts via `satisfies` so the contract has a single source of truth.
 */
import { z } from "zod";
import { DEATH_REASONS, type JournalInput, type MatchListQuery } from "@/lib/types";

/** match-v5 id, e.g. "LA1_1234567890" */
export const matchIdSchema = z.string().regex(/^[A-Z0-9]{2,5}_\d{1,20}$/, "Id de partida inválido");

/** Data Dragon champion id, e.g. "MissFortune" */
export const championSchema = z.string().regex(/^[A-Za-z]{1,30}$/, "Campeón inválido");

export const matchListQuerySchema = z.object({
  champion: championSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}) satisfies z.ZodType<MatchListQuery, unknown>;

export const journalInputSchema = z.object({
  deathReasons: z
    .array(z.enum(DEATH_REASONS))
    .max(DEATH_REASONS.length)
    .transform((list) => [...new Set(list)]),
  lesson: z.string().trim().max(1000, "Máximo 1000 caracteres"),
  tilt: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]),
}) satisfies z.ZodType<JournalInput, unknown>;

/** Converts zod issues into the `fields` map of a VALIDATION_ERROR. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}
