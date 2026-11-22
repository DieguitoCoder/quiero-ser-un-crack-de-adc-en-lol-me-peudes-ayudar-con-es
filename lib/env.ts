/**
 * Server-only runtime configuration. Owner: cobalt.
 * The Riot API key is read ONLY here and must never be returned, logged or sent to the client.
 */
import "server-only";
import path from "node:path";

export interface AppConfig {
  /** null when RIOT_API_KEY is empty/unset */
  riotApiKey: string | null;
  gameName: string;
  tagLine: string;
  /** "gameName#tagLine" */
  riotId: string;
  platform: string;
  region: string;
  mock: boolean;
  /** absolute path, or ":memory:" (tests) */
  dbPath: string;
}

const DEFAULT_RIOT_ID = "xDieguinho#9250";

export function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const idx = raw.lastIndexOf("#");
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { gameName: raw.slice(0, idx).trim(), tagLine: raw.slice(idx + 1).trim() };
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const riotIdRaw = env.RIOT_ID?.trim() || DEFAULT_RIOT_ID;
  const parsed = parseRiotId(riotIdRaw) ?? parseRiotId(DEFAULT_RIOT_ID);
  const gameName = parsed?.gameName ?? "xDieguinho";
  const tagLine = parsed?.tagLine ?? "9250";
  const key = env.RIOT_API_KEY?.trim();
  return {
    riotApiKey: key ? key : null,
    gameName,
    tagLine,
    riotId: `${gameName}#${tagLine}`,
    platform: env.RIOT_PLATFORM?.trim() || "la1",
    region: env.RIOT_REGION?.trim() || "americas",
    mock: env.RIOT_MOCK?.trim() === "1",
    dbPath: env.CLIMB_DB_PATH?.trim() || path.join(process.cwd(), "data", "climb.db"),
  };
}
