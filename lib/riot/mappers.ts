/** Riot DTO → domain mapping. Pure. Owner: cobalt. */
import type { LeagueEntryDto, MatchDto, ParticipantDto } from "@/lib/riot/dto";
import type { MatchWrite } from "@/lib/db/repos";
import { SOLO_QUEUE_TYPE, type Division, type MatchRecord, type TeamPosition, type Tier } from "@/lib/types";

/** Games shorter than this are treated as remakes even without the early-surrender flag. */
export const REMAKE_MAX_DURATION_S = 300;

const TIERS: readonly string[] = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const DIVISIONS: readonly string[] = ["I", "II", "III", "IV"];
const POSITIONS: readonly string[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function optNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function cs(p: ParticipantDto): number {
  return Math.max(0, num(p.totalMinionsKilled) + num(p.neutralMinionsKilled));
}

type ParticipantRecord = Omit<MatchRecord, "matchId" | "gameCreation" | "gameDurationS" | "queueId" | "patch" | "isRemake">;

function isArena(p: ParticipantDto): boolean {
  return typeof p.playerSubteamId === "number" && p.playerSubteamId > 0;
}

/** Team key: Arena duos share playerSubteamId (teamId is 0 there); SR uses teamId. */
function teamKey(p: ParticipantDto): string {
  return isArena(p) ? `s${p.playerSubteamId}` : `t${p.teamId}`;
}

/** Lane opponent = enemy with the same non-empty teamPosition (SR only). */
function mapParticipant(participants: readonly ParticipantDto[], me: ParticipantDto): ParticipantRecord {
  const teamId = me.teamId === 200 ? 200 : 100;
  const position: TeamPosition = POSITIONS.includes(me.teamPosition) ? (me.teamPosition as TeamPosition) : "";

  let opponent: ParticipantDto | null = null;
  if (position !== "" && !isArena(me)) {
    const candidates = participants.filter((p) => p.teamId !== me.teamId && p.teamPosition === position);
    opponent = candidates.length === 1 ? (candidates[0] ?? null) : null;
  }

  const myTeam = teamKey(me);
  const teamKills = participants.filter((p) => teamKey(p) === myTeam).reduce((sum, p) => sum + num(p.kills), 0);
  const myLane10 = optNum(me.challenges?.laneMinionsFirst10Minutes);
  const oppLane10 = opponent ? optNum(opponent.challenges?.laneMinionsFirst10Minutes) : null;

  return {
    puuid: me.puuid,
    championId: num(me.championId),
    championName: me.championName,
    teamId,
    teamPosition: position,
    win: me.win === true,
    kills: Math.max(0, num(me.kills)),
    deaths: Math.max(0, num(me.deaths)),
    assists: Math.max(0, num(me.assists)),
    csTotal: cs(me),
    goldEarned: num(me.goldEarned),
    damageToChampions: num(me.totalDamageDealtToChampions),
    visionScore: num(me.visionScore),
    controlWardsBought: num(me.visionWardsBoughtInGame),
    teamKills,
    opponentChampionId: opponent ? num(opponent.championId) : null,
    opponentChampionName: opponent ? opponent.championName : null,
    opponentCsTotal: opponent ? cs(opponent) : null,
    csDiff10: myLane10 !== null && oppLane10 !== null ? myLane10 - oppLane10 : null,
    maxCsAdvantage: optNum(me.challenges?.maxCsAdvantageOnLaneOpponent),
  };
}

function matchHeader(dto: MatchDto, me: ParticipantDto | undefined) {
  const durationS = Math.max(0, num(dto.info.gameDuration));
  return {
    matchId: dto.metadata.matchId,
    gameCreation: num(dto.info.gameCreation),
    gameDurationS: durationS,
    queueId: num(dto.info.queueId),
    patch: patchFromGameVersion(dto.info.gameVersion ?? ""),
    isRemake: me?.gameEndedInEarlySurrender === true || durationS < REMAKE_MAX_DURATION_S,
  };
}

/** null when `puuid` did not play the match. */
export function mapMatch(dto: MatchDto, puuid: string): MatchRecord | null {
  const participants = dto.info?.participants ?? [];
  const me = participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  return { ...matchHeader(dto, me), ...mapParticipant(participants, me) };
}

/** v2: the whole match with EVERY participant (shared match store, ADR-012). Arena keeps placement 1..8. */
export function mapMatchWrite(dto: MatchDto, platform: string): MatchWrite {
  const participants = (dto.info?.participants ?? []).filter((p) => typeof p.puuid === "string" && p.puuid !== "");
  const header = matchHeader(dto, participants[0]);
  return {
    ...header,
    platform: platform.toLowerCase(),
    isRemake: participants.some((p) => p.gameEndedInEarlySurrender === true) || header.isRemake,
    participants: participants.map((p) => ({
      ...mapParticipant(participants, p),
      riotIdGameName: typeof p.riotIdGameName === "string" && p.riotIdGameName !== "" ? p.riotIdGameName : null,
      riotIdTagLine: typeof p.riotIdTagline === "string" && p.riotIdTagline !== "" ? p.riotIdTagline : null,
      placement: isArena(p) ? optNum(p.placement ?? p.subteamPlacement) : null,
    })),
  };
}

/** "14.23.612.3456" → "14.23" */
export function patchFromGameVersion(gameVersion: string): string {
  const [major, minor] = gameVersion.split(".");
  return major && minor ? `${major}.${minor}` : gameVersion;
}

export function soloQueueEntry(
  entries: readonly LeagueEntryDto[],
): { tier: Tier; division: Division; lp: number; wins: number; losses: number } | null {
  return rankedEntry(entries, SOLO_QUEUE_TYPE);
}

/** League entry for one queueType ("RANKED_SOLO_5x5" | "RANKED_FLEX_SR"); null = unranked there. */
export function rankedEntry(
  entries: readonly LeagueEntryDto[],
  queueType: string,
): { tier: Tier; division: Division; lp: number; wins: number; losses: number } | null {
  const entry = entries.find((e) => e.queueType === queueType);
  if (!entry || !TIERS.includes(entry.tier)) return null;
  const tier = entry.tier as Tier;
  // Master+ always report "I"; be lenient if Riot omits it.
  const division = (DIVISIONS.includes(entry.rank) ? entry.rank : "I") as Division;
  return {
    tier,
    division,
    lp: num(entry.leaguePoints),
    wins: Math.max(0, num(entry.wins)),
    losses: Math.max(0, num(entry.losses)),
  };
}
