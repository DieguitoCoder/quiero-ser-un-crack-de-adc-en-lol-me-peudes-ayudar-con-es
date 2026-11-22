/** Owner: cobalt. death_reasons is stored as a JSON array; parse defensively (unknown codes dropped). */
import type { Db } from "@/lib/db/connection";
import {
  DEATH_REASONS,
  type DeathReason,
  type JournalEntry,
  type JournalEntryRow,
  type JournalInput,
  type TiltLevel,
} from "@/lib/types";

function parseReasons(raw: string): DeathReason[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const allowed: readonly string[] = DEATH_REASONS;
  const out: DeathReason[] = [];
  for (const v of parsed) {
    if (typeof v === "string" && allowed.includes(v) && !out.includes(v as DeathReason)) out.push(v as DeathReason);
  }
  return out;
}

function toTilt(value: number | null): TiltLevel | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function toEntry(row: JournalEntryRow): JournalEntry {
  return {
    matchId: row.match_id,
    deathReasons: parseReasons(row.death_reasons),
    lesson: row.lesson,
    tilt: toTilt(row.tilt),
    updatedAt: row.updated_at,
  };
}

export function getJournalEntry(db: Db, matchId: string): JournalEntry | null {
  const row = db.prepare("SELECT * FROM journal_entries WHERE match_id = ?").get(matchId) as JournalEntryRow | undefined;
  return row ? toEntry(row) : null;
}

/** INSERT ... ON CONFLICT(match_id) DO UPDATE. */
export function upsertJournalEntry(db: Db, matchId: string, input: JournalInput, now: number): JournalEntry {
  const reasons = [...new Set(input.deathReasons)].filter((r) => (DEATH_REASONS as readonly string[]).includes(r));
  db.prepare(
    `INSERT INTO journal_entries (match_id, death_reasons, lesson, tilt, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       death_reasons = excluded.death_reasons, lesson = excluded.lesson,
       tilt = excluded.tilt, updated_at = excluded.updated_at`,
  ).run(matchId, JSON.stringify(reasons), input.lesson.trim().slice(0, 1000), input.tilt, now);
  const entry = getJournalEntry(db, matchId);
  if (!entry) throw new Error("journal upsert failed");
  return entry;
}

/** Entries for the given matches (used by the coach summary). */
export function listJournalEntries(db: Db, matchIds: readonly string[]): JournalEntry[] {
  const out: JournalEntry[] = [];
  const CHUNK = 500;
  for (let i = 0; i < matchIds.length; i += CHUNK) {
    const chunk = matchIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const rows = db
      .prepare(`SELECT * FROM journal_entries WHERE match_id IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk) as JournalEntryRow[];
    out.push(...rows.map(toEntry));
  }
  return out;
}

/** Which of the given matches have a journal entry (match list `hasJournal`). */
export function journalMatchIds(db: Db, matchIds: readonly string[]): Set<string> {
  return new Set(listJournalEntries(db, matchIds).map((e) => e.matchId));
}
