import { afterEach, describe, expect, it } from "vitest";
import { createPgliteDb } from "@/lib/db/drivers";
import { runMigrations } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";

let db: Db | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

describe("migrations on PGlite", () => {
  it("applies all files once and is idempotent", async () => {
    db = await createPgliteDb();
    expect(await runMigrations(db)).toEqual(["0001_init.sql", "0002_rls.sql", "0003_indexes.sql"]);
    expect(await runMigrations(db)).toEqual([]);
  });

  it("enables RLS on every table with no policies and creates key indexes", async () => {
    db = await createPgliteDb();
    await runMigrations(db);
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace",
    );
    expect(rls.rows.length).toBeGreaterThanOrEqual(9);
    expect(rls.rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    const policies = await db.query<{ n: number }>("select count(*)::int as n from pg_policies");
    expect(policies.rows[0]?.n).toBe(0);
    const idx = await db.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'");
    expect(idx.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(["mp_puuid_creation_idx", "matches_queue_idx", "journal_entries_match_idx"]),
    );
  });

  it("normalizes bigint to number, jsonb to value, text[] to string[]", async () => {
    db = await createPgliteDb();
    const r = await db.query<{ b: number; j: unknown; a: string[]; n: null }>(
      "select $1::bigint as b, $2::jsonb as j, $3::text[] as a, null as n",
      [1_700_000_000_123, { x: [1, 2] }, ["a", "b"]],
    );
    expect(r.rows[0]).toEqual({ b: 1_700_000_000_123, j: { x: [1, 2] }, a: ["a", "b"], n: null });
  });
});
