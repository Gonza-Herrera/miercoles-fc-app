export interface PlayerPerformance {
  playerId: string;
  goals: number;
  assists: number;
}

export interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  players: PlayerPerformance[];
  mvpPlayerId: string | null;
}

export interface EventSports { fixtures: MatchResult[]; }
export interface SportsRecord {
  event_id: string;
  data: EventSports;
  version: number;
  last_operation: string;
  updated_at: string;
}
