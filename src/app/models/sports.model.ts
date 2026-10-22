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

export interface FixturePoll {
  event_id: string;
  fixture_id: string;
  eligible_player_ids: string[];
  closed_at: string | null;
  winner_player_ids: string[];
  vote_count: number | null;
}

export interface FixtureVote {
  event_id: string;
  fixture_id: string;
  voter_id: string;
  candidate_id: string;
  version: number;
  last_operation: string;
}
