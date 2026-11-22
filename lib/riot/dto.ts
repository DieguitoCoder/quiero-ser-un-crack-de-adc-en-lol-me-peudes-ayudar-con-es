/**
 * Riot API response shapes (only the fields we read). Owner: cobalt.
 * Internal to lib/riot and lib/sync — UI code must use lib/types.ts instead.
 */
export interface AccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export interface ParticipantChallengesDto {
  laneMinionsFirst10Minutes?: number;
  maxCsAdvantageOnLaneOpponent?: number;
  killParticipation?: number;
  controlWardsPlaced?: number;
}

export interface ParticipantDto {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  gameEndedInEarlySurrender?: boolean;
  challenges?: ParticipantChallengesDto;
}

export interface MatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameVersion: string;
    queueId: number;
    participants: ParticipantDto[];
  };
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface SummonerDto {
  id?: string;
  puuid: string;
}
