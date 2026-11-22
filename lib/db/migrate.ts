/**
 * Applies supabase/migrations/*.sql in filename order, recording each in schema_migrations.
 * Owner: quartz. Used by tests (PGlite) and local dev. Production Supabase is migrated with
 * `supabase db push` (or SQL editor) from the same files, never at request time.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/lib/db/types";

export const MIGRATIONS_DIR = "supabase/migrations";

/** Returns names of migrations applied by this call. Idempotent. */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const abs = path.resolve(process.cwd(), dir);
  const files = (await readdir(abs)).filter((f) => f.endsWith(".sql")).sort();
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at bigint not null)");
  const done = await db.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(done.rows.map((r) => r.name));
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(abs, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (name, applied_at) values ($1, $2)", [file, Date.now()]);
    });
    ran.push(file);
  }
  return ran;
}
