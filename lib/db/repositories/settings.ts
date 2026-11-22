/** Owner: cobalt. Never store the Riot API key here. */
import type { Db } from "@/lib/db/connection";
import type { SettingKey } from "@/lib/types";

export function getSetting(db: Db, key: SettingKey): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: SettingKey, value: string, now: number): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

export function deleteSetting(db: Db, key: SettingKey): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
