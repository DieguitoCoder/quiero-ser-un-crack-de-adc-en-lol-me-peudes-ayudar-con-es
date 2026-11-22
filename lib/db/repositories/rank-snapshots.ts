/**
 * Owner: cobalt.
 * Note: imports the PURE `lib/coach/ranks` helpers (already implemented, no I/O) so `ladderScore`
 * has a single implementation; RankSnapshot requires it.
 */
import type { Db } from "@/lib/db/connection";
import { isDivision, isTier, ladderScore } from "@/lib/coach/ranks";
import { SOLO_QUEUE_TYPE, type Division, type RankSnapshot, type RankSnapshotRow, type Tier } from "@/lib/types";

export interface NewRankSnapshot {
  puuid: string;
  takenAt: number;
  tier: Tier | null;
  division: Division | null;
  lp: number;
  wins: number;
  losses: number;
}

function toSnapshot(row: RankSnapshotRow): RankSnapshot {
  const tier = row.tier !== null && isTier(row.tier) ? row.tier : null;
  const division = tier !== null && row.division !== null && isDivision(row.division) ? row.division : null;
  return {
    id: row.id,
    puuid: row.puuid,
    takenAt: row.taken_at,
    queueType: row.queue_type,
    tier,
    division,
    lp: row.lp,
    wins: row.wins,
    losses: row.losses,
    ladderScore: tier !== null ? ladderScore(tier, division ?? "I", row.lp) : null,
  };
}

/** Inserts only if tier/division/lp/wins/losses differ from the latest snapshot. Returns the latest snapshot and whether a row was created. */
export function insertSnapshotIfChanged(
  db: Db,
  snapshot: NewRankSnapshot,
): { snapshot: RankSnapshot; created: boolean } {
  return db.transaction(() => {
    const latest = latestSnapshot(db, snapshot.puuid);
    const tier = snapshot.tier;
    const division = tier === null ? null : snapshot.division;
    if (
      latest &&
      latest.tier === tier &&
      latest.division === division &&
      latest.lp === snapshot.lp &&
      latest.wins === snapshot.wins &&
      latest.losses === snapshot.losses
    ) {
      return { snapshot: latest, created: false };
    }
    const res = db
      .prepare(
        `INSERT INTO rank_snapshots (puuid, taken_at, queue_type, tier, division, lp, wins, losses)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(snapshot.puuid, snapshot.takenAt, SOLO_QUEUE_TYPE, tier, division, snapshot.lp, snapshot.wins, snapshot.losses);
    const row = db.prepare("SELECT * FROM rank_snapshots WHERE id = ?").get(res.lastInsertRowid) as RankSnapshotRow;
    return { snapshot: toSnapshot(row), created: true };
  })();
}

export function latestSnapshot(db: Db, puuid: string): RankSnapshot | null {
  const row = db
    .prepare(
      `SELECT * FROM rank_snapshots WHERE puuid = ? AND queue_type = ?
        ORDER BY taken_at DESC, id DESC LIMIT 1`,
    )
    .get(puuid, SOLO_QUEUE_TYPE) as RankSnapshotRow | undefined;
  return row ? toSnapshot(row) : null;
}

/** Oldest first. */
export function listSnapshots(db: Db, puuid: string): RankSnapshot[] {
  const rows = db
    .prepare(`SELECT * FROM rank_snapshots WHERE puuid = ? AND queue_type = ? ORDER BY taken_at ASC, id ASC`)
    .all(puuid, SOLO_QUEUE_TYPE) as RankSnapshotRow[];
  return rows.map(toSnapshot);
}
