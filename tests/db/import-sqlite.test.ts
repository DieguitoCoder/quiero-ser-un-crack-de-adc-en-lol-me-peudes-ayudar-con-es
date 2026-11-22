import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "@/lib/db/migrations";
import * as repo from "@/lib/db/repos";
import type { Db } from "@/lib/db/types";
import { importSqlite } from "@/scripts/import-sqlite";
import { createTestDb } from "./helpers";

const USER = "00000000-0000-4000-8000-0000000000aa";
let dir: string;
let file: string;
let db: Db;

function buildV1(target: string): void {
  const lite = new Database(target);
  for (const m of MIGRATIONS) lite.exec(m.sql);
  lite.prepare("insert into summoner values ('p1', 'Me', 'LAN', 'la1', 1)").run();
  const insMatch = lite.prepare("insert into matches values (?, ?, 1800, ?, '14.1', 0, null, 1)");
  insMatch.run("M1", 1000, 420);
  insMatch.run("M2", 2000, 450);
  const insPart = lite.prepare(
    `insert into match_participant values (?, 'p1', 1, 'Ahri', 100, 'MIDDLE', 1, 5, 2, 3, 180, 10000, 15000, 20, 2, 20,
     null, null, null, null, null)`,
  );
  insPart.run("M1");
  insPart.run("M2");
  lite.prepare("insert into rank_snapshots (puuid, taken_at, queue_type, tier, division, lp, wins, losses) values ('p1', 5, 'RANKED_SOLO_5x5', 'GOLD', 'I', 10, 3, 2)").run();
  lite.prepare(`insert into journal_entries values ('M1', '["no_vision"]', 'ward more', 2, 7)`).run();
  lite.close();
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "ct-import-"));
  file = path.join(dir, "climb.db");
  buildV1(file);
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("importSqlite", () => {
  it("imports v1 data into the user's account and is idempotent", async () => {
    const first = await importSqlite({ sqlitePath: file, userId: USER, db, now: 100 });
    expect(first).toEqual({ matches: 2, journal: 1, snapshots: 1 });
    const second = await importSqlite({ sqlitePath: file, userId: USER, db, now: 200 });
    expect(second).toEqual({ matches: 0, journal: 0, snapshots: 0 });

    expect(await repo.getProfile(db, USER)).toMatchObject({ puuid: "p1", gameName: "Me", verified: false });
    expect(await repo.countMatches(db, "p1")).toBe(2);
    expect(await repo.countMatches(db, "p1", { kind: "id", id: 450 })).toBe(1);
    expect(await repo.getJournalEntry(db, USER, "M1")).toEqual({
      matchId: "M1", deathReasons: ["no_vision"], lesson: "ward more", tilt: 2, updatedAt: 7,
    });
    expect((await repo.listRankSnapshots(db, "p1", 420)).length).toBe(1);
  });

  it("rejects a non-UUID user id", async () => {
    await expect(importSqlite({ sqlitePath: file, userId: "nope", db })).rejects.toThrow(/UUID/);
  });
});
