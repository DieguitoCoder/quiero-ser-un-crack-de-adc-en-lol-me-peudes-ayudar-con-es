/**
 * Data Dragon helpers (champion icons + display names). Owner: lumen.
 * Version is pinned (no runtime network call to resolve it); bump manually when new champions are needed.
 * Pure module: safe in server and client components.
 */
export const DDRAGON_VERSION = "15.24.1";

/**
 * Inputs whose Data Dragon id cannot be derived by stripping punctuation/spaces.
 * Keys are lowercased alphanumerics of the input (display name or match-v5 championName).
 */
const SPECIAL_IDS: Readonly<Record<string, string>> = {
  wukong: "MonkeyKing",
  monkeyking: "MonkeyKing",
  nunu: "Nunu",
  nunuwillump: "Nunu",
  nunuywillump: "Nunu",
  renata: "Renata",
  renataglasc: "Renata",
  fiddlesticks: "Fiddlesticks",
  kaisa: "Kaisa",
  belveth: "Belveth",
  chogath: "Chogath",
  khazix: "Khazix",
  velkoz: "Velkoz",
  leblanc: "Leblanc",
  kogmaw: "KogMaw",
  reksai: "RekSai",
  ksante: "KSante",
  drmundo: "DrMundo",
};

/** Data Dragon id -> Spanish/official display name, when it is not a plain CamelCase split. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  MonkeyKing: "Wukong",
  Nunu: "Nunu y Willump",
  Renata: "Renata Glasc",
  Kaisa: "Kai'Sa",
  Belveth: "Bel'Veth",
  Chogath: "Cho'Gath",
  Khazix: "Kha'Zix",
  Velkoz: "Vel'Koz",
  Leblanc: "LeBlanc",
  KogMaw: "Kog'Maw",
  RekSai: "Rek'Sai",
  KSante: "K'Sante",
  DrMundo: "Dr. Mundo",
  JarvanIV: "Jarvan IV",
};

/**
 * Normalizes a champion name (match-v5 `championName` like "MissFortune"/"FiddleSticks",
 * or a display name like "Miss Fortune", "Kai'Sa", "Wukong") to its Data Dragon id.
 * Returns "" for empty input.
 */
export function championDdragonId(championName: string): string {
  const trimmed = championName.trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  const special = SPECIAL_IDS[key];
  if (special) return special;
  // "Miss Fortune" -> "MissFortune", "Jarvan IV" -> "JarvanIV"; already-CamelCase ids pass through.
  return trimmed
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Human-readable name for alt text and labels: "MissFortune" -> "Miss Fortune", "MonkeyKing" -> "Wukong". */
export function championDisplayName(championName: string): string {
  const id = championDdragonId(championName);
  if (!id) return "Campeón desconocido";
  return DISPLAY_NAMES[id] ?? id.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Square champion icon URL (120x120 PNG). Returns "" for empty names. */
export function championIconUrl(championName: string, version: string = DDRAGON_VERSION): string {
  const id = championDdragonId(championName);
  if (!id) return "";
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${encodeURIComponent(id)}.png`;
}
