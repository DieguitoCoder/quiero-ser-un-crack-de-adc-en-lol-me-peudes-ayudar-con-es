/** Shared test helper (owner: quartz): fresh in-memory PGlite with all supabase/migrations applied. */
import { createPgliteDb } from "@/lib/db/drivers";
import { runMigrations } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";

export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  await runMigrations(db);
  return db;
}

/** Inserts a profile row so journal entries (FK -> profiles) can be written. */
export async function seedProfile(
  db: Db,
  userId: string,
  puuid: string | null = null,
  now = 1_700_000_000_000,
): Promise<void> {
  await db.query(
    `insert into profiles (user_id, puuid, platform, verified, created_at, updated_at)
     values ($1, $2, 'la1', false, $3, $3) on conflict do nothing`,
    [userId, puuid, now],
  );
}
