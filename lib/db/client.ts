/**
 * Db factories. Owner: quartz. Server-only.
 * - Production/Vercel: postgres.js over DATABASE_URL (Supavisor pooled, port 6543),
 *   { prepare: false, max: 1, idle_timeout: 20 }, int8 parsed to number. Module-level singleton.
 * - Dev/tests (DATABASE_URL unset): PGlite in-memory (or `PGLITE_DIR` on disk), migrations applied.
 */
import "server-only";
import type { Db } from "@/lib/db/types";
import { createPgliteDb, createPostgresDb } from "@/lib/db/drivers";
import { runMigrations } from "@/lib/db/migrate";

export { createPgliteDb, createPostgresDb };

let appDb: Promise<Db> | null = null;

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && url.trim() !== "") return createPostgresDb(url);
  const db = await createPgliteDb(process.env.PGLITE_DIR || undefined);
  await runMigrations(db);
  return db;
}

/** Process-wide Db: postgres when DATABASE_URL is set, else migrated PGlite singleton. */
export async function getAppDb(): Promise<Db> {
  if (!appDb) {
    appDb = init().catch((err: unknown) => {
      appDb = null;
      throw err;
    });
  }
  return appDb;
}
