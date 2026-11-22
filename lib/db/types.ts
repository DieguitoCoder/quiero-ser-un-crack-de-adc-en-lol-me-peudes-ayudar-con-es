/**
 * The single data-access port (v2). Owner: orion (contract), quartz (implementations).
 *
 * Implementations (lib/db/client.ts): PGlite for tests/local (`createPgliteDb`) and postgres.js over
 * DATABASE_URL for Vercel (`createPostgresDb`). Repositories receive a `Db`; they never import a driver.
 *
 * Normalization every implementation MUST honour so repositories behave identically on both:
 *   - int8/bigint and numeric → JS number (epoch ms fit in 2^53); boolean → boolean;
 *     jsonb → parsed value; text[] → string[]; SQL NULL → null.
 *   - Positional placeholders `$1..$n`. Never interpolate values into SQL.
 */
export type SqlParam =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | { readonly [key: string]: unknown };

export interface QueryResult<Row> {
  rows: Row[];
  /** rows affected by INSERT/UPDATE/DELETE */
  rowCount: number;
}

export interface Db {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<QueryResult<Row>>;
  /** BEGIN/COMMIT around `fn` (ROLLBACK on throw). Calling on a `tx` reuses the same transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /** Multi-statement script without params (migrations only). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
