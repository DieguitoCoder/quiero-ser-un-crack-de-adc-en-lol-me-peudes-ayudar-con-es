// Regenerates the synthetic Riot fixtures used by RIOT_MOCK=1 and tests. Owner: cobalt.
// Usage (from project root): node lib/riot/fixtures/generate-fixtures.mjs
// All puuids/names are synthetic. Deterministic output (no randomness, fixed timestamps).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ME = "mock-puuid-xdieguinho-9250-0000000000000000000000000000000000000000";
const CHAMPS = { Jinx: 222, MissFortune: 21, Tristana: 18, Ashe: 22, Caitlyn: 51, Ezreal: 81, KaiSa: 145, Varus: 110,
  Thresh: 412, Lulu: 117, Nautilus: 111, LeeSin: 64, Ahri: 103, Darius: 122, Vi: 254, Yasuo: 157, Garen: 86,
  Lux: 99, Graves: 104, Malphite: 54, Leona: 89, Sett: 875 };
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const ALLY_FILL = { TOP: "Darius", JUNGLE: "Vi", MIDDLE: "Ahri", UTILITY: "Thresh" };
const ENEMY_FILL = { TOP: "Garen", JUNGLE: "Graves", MIDDLE: "Yasuo", UTILITY: "Lulu" };

// Newest first. [champ, opponent, win, k, d, a, cs, durationS, wards, vision, lane10Me, lane10Opp, opts]
const GAMES = [
  ["Jinx", "Caitlyn", false, 3, 9, 4, 168, 1850, 0, 14, 58, 72, {}],
  ["MissFortune", "Ezreal", false, 4, 7, 5, 175, 1720, 1, 18, 62, 66, {}],
  ["Jinx", "Varus", true, 11, 3, 7, 232, 1910, 2, 25, 74, 64, {}],
  ["Tristana", "KaiSa", true, 8, 4, 6, 201, 1680, 1, 20, 70, 68, {}],
  ["Ashe", "Caitlyn", false, 2, 6, 12, 160, 2040, 0, 22, 55, 69, {}],
  ["Jinx", "Ezreal", true, 9, 2, 8, 218, 1790, 1, 19, 76, 60, {}],
  ["MissFortune", "Jinx", false, 0, 0, 0, 12, 210, 0, 1, 0, 0, { remake: true, noChallenges: true }],
  ["Tristana", "Caitlyn", false, 5, 8, 3, 158, 1600, 0, 11, 57, 73, { noChallenges: true }],
  ["Jinx", "KaiSa", true, 7, 4, 10, 205, 2210, 2, 31, 68, 65, {}],
  ["Ashe", "Varus", true, 6, 5, 14, 190, 1950, 1, 28, 64, 63, {}],
  ["MissFortune", "Caitlyn", true, 10, 5, 6, 196, 1880, 1, 17, 66, 70, { noPosition: true }],
  ["Jinx", "Ezreal", false, 4, 7, 6, 171, 1760, 0, 13, 60, 71, {}],
  ["Tristana", "Varus", true, 12, 3, 5, 226, 1700, 1, 16, 78, 61, {}],
];

const NEWEST = Date.UTC(2026, 10, 21, 23, 0, 0); // 2026-11-21 23:00 UTC
const ids = [];
fs.mkdirSync(path.join(dir, "matches"), { recursive: true });

GAMES.forEach(([champ, opp, win, k, d, a, cs, dur, wards, vision, l10me, l10opp, opts], i) => {
  const matchId = `LA1_${1500000100 - i}`;
  ids.push(matchId);
  const myTeam = i % 2 === 0 ? 100 : 200;
  const participants = [];
  let n = 0;
  const mk = (teamId, role, championName, isMe, isOpp) => {
    n++;
    const mine = teamId === myTeam;
    const base = {
      puuid: isMe ? ME : `mock-puuid-${matchId.toLowerCase()}-p${String(n).padStart(2, "0")}`,
      riotIdGameName: isMe ? "xDieguinho" : `Jugador${i}${n}`,
      riotIdTagline: isMe ? "9250" : "MOCK",
      championId: CHAMPS[championName],
      championName,
      teamId,
      teamPosition: opts.noPosition && (isMe || isOpp) ? "" : role,
      individualPosition: role,
      win: mine ? win : !win,
      kills: isMe ? k : isOpp ? d : opts.remake ? 0 : 2 + ((n * 3 + i) % 6),
      deaths: isMe ? d : isOpp ? Math.max(1, k - 2) : opts.remake ? 0 : 3 + ((n + i) % 5),
      assists: isMe ? a : opts.remake ? 0 : 4 + ((n * 5 + i) % 8),
      totalMinionsKilled: isMe ? cs - 4 : isOpp ? cs + (l10opp - l10me) - 4 : role === "JUNGLE" ? 30 : role === "UTILITY" ? 25 : 150 + n * 3,
      neutralMinionsKilled: isMe || isOpp ? 4 : role === "JUNGLE" ? 140 : 2,
      goldEarned: isMe ? Math.round(dur * 6.8 + k * 300) : Math.round(dur * 6.2),
      totalDamageDealtToChampions: isMe ? Math.round(dur * 11 + k * 900) : Math.round(dur * 8),
      visionScore: isMe ? vision : 15 + n,
      visionWardsBoughtInGame: isMe ? wards : n % 3,
      gameEndedInEarlySurrender: Boolean(opts.remake),
      teamEarlySurrendered: Boolean(opts.remake) && mine,
    };
    if (!opts.noChallenges) {
      base.challenges = {
        laneMinionsFirst10Minutes: isMe ? l10me : isOpp ? l10opp : role === "TOP" || role === "MIDDLE" ? 65 : 5,
        maxCsAdvantageOnLaneOpponent: isMe ? Math.max(0, l10me - l10opp + 8) : isOpp ? Math.max(0, l10opp - l10me + 8) : 4,
        killParticipation: 0.5,
        controlWardsPlaced: isMe ? wards : n % 3,
      };
    }
    participants.push(base);
  };
  for (const team of [100, 200]) {
    for (const role of ROLES) {
      if (team === myTeam) mk(team, role, role === "BOTTOM" ? champ : ALLY_FILL[role], role === "BOTTOM", false);
      else mk(team, role, role === "BOTTOM" ? opp : ENEMY_FILL[role], false, role === "BOTTOM");
    }
  }
  const gameCreation = NEWEST - i * 3 * 60 * 60 * 1000 - (i > 5 ? 86400000 : 0);
  const dto = {
    metadata: { dataVersion: "2", matchId, participants: participants.map((p) => p.puuid) },
    info: {
      endOfGameResult: "GameComplete",
      gameCreation,
      gameStartTimestamp: gameCreation + 30000,
      gameEndTimestamp: gameCreation + 30000 + dur * 1000,
      gameDuration: dur,
      gameId: Number(matchId.slice(4)),
      gameMode: "CLASSIC",
      gameType: "MATCHED_GAME",
      gameVersion: i < 6 ? "15.23.725.1234" : "15.22.711.9876",
      mapId: 11,
      platformId: "LA1",
      queueId: 420,
      participants,
      teams: [100, 200].map((teamId) => ({ teamId, win: teamId === myTeam ? win : !win })),
    },
  };
  fs.writeFileSync(path.join(dir, "matches", `${matchId}.json`), JSON.stringify(dto, null, 2) + "\n");
});

fs.writeFileSync(path.join(dir, "match-ids.json"), JSON.stringify(ids, null, 2) + "\n");
fs.writeFileSync(
  path.join(dir, "account.json"),
  JSON.stringify({ puuid: ME, gameName: "xDieguinho", tagLine: "9250" }, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(dir, "league-entries.json"),
  JSON.stringify(
    [
      { leagueId: "mock-league-0001", queueType: "RANKED_SOLO_5x5", tier: "BRONZE", rank: "III", puuid: ME,
        leaguePoints: 45, wins: 30, losses: 28, veteran: false, inactive: false, freshBlood: false, hotStreak: false },
      { leagueId: "mock-league-0002", queueType: "RANKED_FLEX_SR", tier: "SILVER", rank: "IV", puuid: ME,
        leaguePoints: 10, wins: 6, losses: 5, veteran: false, inactive: false, freshBlood: true, hotStreak: false },
    ],
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${ids.length} matches`);
