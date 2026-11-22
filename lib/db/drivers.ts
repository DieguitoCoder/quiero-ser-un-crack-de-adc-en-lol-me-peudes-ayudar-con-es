/**
 * Driver adapters implementing the `Db` port. Owner: quartz.
 * No "server-only" import so scripts (tsx) can use it; app code goes through lib/db/client.ts.
 * Normalization (lib/db/types.ts): int8/numeric -> number, jsonb -> value, text[] -> string[], NULL -> null.
 * Params: plain (non-array) objects are sent as JSON text; cast with `$n::jsonb` in SQL.
 * Arrays are sent as Postgres arrays; cast with `$n::text[]` / `$n::int[]`.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import postgres from "postgres";
import type { Db, QueryResult, SqlParam } from "@/lib/db/types";

const INT8_OID = 20;
const NUMERIC_OID = 1700;

function toNumber(raw: string): number {
  return Number(raw);
}

function normalizeValue(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(normalizeValue);
  return v;
}

function normalizeRows<Row extends object>(rows: readonly unknown[]): Row[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) out[k] = normalizeValue(v);
    // Row shape is defined by the caller's SQL; the adapter only normalizes scalar types.
    return out as Row;
  });
}

function serializeParams(params: readonly SqlParam[] | undefined): unknown[] {
  if (!params) return [];
  return params.map((p) => {
    if (p !== null && typeof p === "object" && !Array.isArray(p)) return JSON.stringify(p);
    return p;
  });
}

/* ---------------- PGlite ---------------- */

type PgliteConn = PGlite | Transaction;

function pgliteDb(conn: PgliteConn, root: PGlite | null): Db {
  const self: Db = {
    async query<Row extends object = Record<string, unknown>>(
      sql: string,
      params?: readonly SqlParam[],
    ): Promise<QueryResult<Row>> {
      const res = await conn.query<Record<string, unknown>>(sql, serializeParams(params));
      return { rows: normalizeRows<Row>(res.rows), rowCount: res.affectedRows ?? res.rows.length };
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (!root) return fn(self);
      return root.transaction((tx) => fn(pgliteDb(tx, null)));
    },
    async exec(sql: string): Promise<void> {
      await conn.exec(sql);
    },
    async close(): Promise<void> {
      if (root) await root.close();
    },
  };
  return self;
}

/** In-memory when `dataDir` is undefined. Does NOT run migrations (call runMigrations). */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = new PGlite(dataDir, { parsers: { [INT8_OID]: toNumber, [NUMERIC_OID]: toNumber } });
  await pg.waitReady;
  return pgliteDb(pg, pg);
}

/* ---------------- postgres.js ---------------- */

type Sql = postgres.Sql<Record<string, never>>;
type TxSql = postgres.TransactionSql<Record<string, never>>;

function postgresDb(sql: Sql | TxSql, root: Sql | null): Db {
  const self: Db = {
    async query<Row extends object = Record<string, unknown>>(
      text: string,
      params?: readonly SqlParam[],
    ): Promise<QueryResult<Row>> {
      // postgres.js ParameterOrJSON typing is narrower than our serialized params (all valid at runtime).
      const res = await sql.unsafe(text, serializeParams(params) as postgres.ParameterOrJSON<never>[]);
      return { rows: normalizeRows<Row>(res), rowCount: res.count ?? res.length };
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (!root) return fn(self);
      const out = await root.begin((tx) => fn(postgresDb(tx, null)));
      // begin() wraps T in UnwrapPromiseArray; for the values repos return it is T.
      return out as T;
    },
    async exec(text: string): Promise<void> {
      await sql.unsafe(text);
    },
    async close(): Promise<void> {
      if (root) await root.end({ timeout: 5 });
    },
  };
  return self;
}

/** Supavisor transaction pooler (:6543) requires prepare:false. One client per warm lambda. */
export function createPostgresDb(databaseUrl: string, opts: { max?: number } = {}): Db {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: opts.max ?? 1,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
    types: {
      int8: { to: INT8_OID, from: [INT8_OID], serialize: (x: number) => String(x), parse: toNumber },
      numeric: { to: NUMERIC_OID, from: [NUMERIC_OID], serialize: (x: number) => String(x), parse: toNumber },
    },
  }) as unknown as Sql; // custom `types` widen the generic; repos never use typed helpers.
  return postgresDb(sql, sql);
}
