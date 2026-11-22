/** Owner: orion. Guards the scaffold contracts: native SQLite + schema, ladder formula, error map. */
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/connection";
import { MIGRATIONS } from "@/lib/db/migrations";
import { ladderScore, phaseForTier, rankFromLadderScore } from "@/lib/coach/ranks";
import { ERROR_HTTP_STATUS, ERROR_MESSAGES_ES } from "@/lib/errors";
import { getConfig } from "@/lib/env";

describe("database", () => {
  it("opens in memory, applies all migrations and creates every table", () => {
    const db = openDatabase(":memory:");
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(["journal_entries", "match_participant", "matches", "rank_snapshots", "settings", "summoner"]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
  });
});

describe("ladder score", () => {
  it("matches the documented anchors", () => {
    expect(ladderScore("BRONZE", "III", 0)).toBe(500);
    expect(ladderScore("PLATINUM", "IV", 0)).toBe(1600);
    expect(ladderScore("IRON", "IV", -5)).toBe(0);
    expect(ladderScore("DIAMOND", "I", 100)).toBe(2800);
    expect(ladderScore("CHALLENGER", "I", 900)).toBe(3700);
    expect(rankFromLadderScore(545)).toEqual({ tier: "BRONZE", division: "III", lp: 45 });
  });

  it("maps tiers to goal phases", () => {
    expect(phaseForTier(null)).toBe("BRONZE");
    expect(phaseForTier("SILVER")).toBe("SILVER");
    expect(phaseForTier("EMERALD")).toBe("GOLD");
  });
});

describe("contracts", () => {
  it("has a status and a Spanish message for every error code", () => {
    expect(Object.keys(ERROR_MESSAGES_ES).sort()).toEqual(Object.keys(ERROR_HTTP_STATUS).sort());
  });

  it("never exposes the key value through config consumers by accident", () => {
    const cfg = getConfig({ NODE_ENV: "test", RIOT_API_KEY: "  ", RIOT_MOCK: "1" });
    expect(cfg.riotApiKey).toBeNull();
    expect(cfg.mock).toBe(true);
    expect(cfg.riotId).toBe("xDieguinho#9250");
  });
});
