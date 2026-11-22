/**
 * SQLite connection (better-sqlite3, synchronous). Owner: cobalt.
 * - Single connection per process, cached on globalThis so Next dev HMR does not leak handles.
 * - Creates the data/ directory and runs pending migrations on first use.
 * - Only import from server code (route handlers, lib/services, Server Components).
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getConfig } from "@/lib/env";
import { MIGRATIONS, type Migration } from "@/lib/db/migrations";

export type Db = Database.Database;

const globalForDb = globalThis as unknown as { __climbDb?: Db };

export function openDatabase(dbPath: string, migrations: readonly Migration[] = MIGRATIONS): Db {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db, migrations);
  return db;
}

export function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): void {
  const current = Number(db.pragma("user_version", { simple: true }));
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${Math.trunc(m.version)}`);
    })();
  }
}

/** Lazily opened app-wide connection. */
export function getDb(): Db {
  globalForDb.__climbDb ??= openDatabase(getConfig().dbPath);
  return globalForDb.__climbDb;
}
