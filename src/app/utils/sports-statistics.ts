import { SoccerEvent } from '../models/event.model';
import { EventSports, FixturePoll, MatchResult } from '../models/sports.model';

export function fixtureParticipants(event: SoccerEvent, fixture: Pick<MatchResult, 'homeTeamId' | 'awayTeamId'>) {
  const teams = event.teams?.teams ?? [];
  const present = new Set(event.matchPlayedPlayerIds);
  const home = teams.find(t => t.id === fixture.homeTeamId);
  const away = teams.find(t => t.id === fixture.awayTeamId);
  return {
    home: [...new Set(home?.playerIds ?? [])].filter(id => present.has(id)),
    away: [...new Set(away?.playerIds ?? [])].filter(id => present.has(id))
  };
}

export function validateSports(event: SoccerEvent, sports: EventSports): string | null {
  if (!['dinner', 'completed'].includes(event.status)) return 'Primero confirmá quiénes jugaron el partido.';
  if (sports.fixtures.length > 50) return 'Se permiten hasta 50 cruces por fecha.';
  if (new Set(sports.fixtures.map(f => f.id)).size !== sports.fixtures.length) return 'Hay cruces repetidos.';
  const integer = (n: number) => Number.isInteger(n) && n >= 0 && n <= 999;
  for (const fixture of sports.fixtures) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixture.id)) return 'Identidad de cruce inválida.';
    const { home, away } = fixtureParticipants(event, fixture);
    if (fixture.homeTeamId === fixture.awayTeamId || !home.length || !away.length || home.some(id => away.includes(id))) {
      return 'Seleccioná dos equipos distintos, con presentes y sin jugadores compartidos.';
    }
    if (!integer(fixture.homeScore) || !integer(fixture.awayScore)) return 'Completá ambos marcadores con enteros entre 0 y 999.';
    const eligible = [...home, ...away];
    if (fixture.mvpPlayerId && !eligible.includes(fixture.mvpPlayerId)) return 'El jugador del partido debe haber participado del cruce.';
    if (new Set(fixture.players.map(p => p.playerId)).size !== fixture.players.length) return 'Hay jugadores repetidos.';
    for (const player of fixture.players) {
      if (!eligible.includes(player.playerId)) return 'Solo podés cargar estadísticas de los presentes de esos equipos.';
      if (!integer(player.goals) || !integer(player.assists)) return 'Los goles y asistencias deben ser enteros entre 0 y 999.';
    }
    for (const [ids, score] of [[home, fixture.homeScore], [away, fixture.awayScore]] as const) {
      const players = fixture.players.filter(p => ids.includes(p.playerId));
      if (players.reduce((sum, p) => sum + p.goals, 0) > score || players.reduce((sum, p) => sum + p.assists, 0) > score) {
        return 'Los goles y asistencias de un equipo no pueden superar su marcador.';
      }
      if (players.some(p => p.goals + p.assists > score)) return 'Un jugador no puede asistir sus propios goles.';
    }
  }
  return null;
}

export function calculateSportsStatistics(history: { data: SoccerEvent; event_sports?: { data: EventSports } | null; fixture_polls?: FixturePoll[];
  event_rsvps: { player_id: string; player: { name: string } }[] }[]) {
  const players = new Map<string, { id: string; name: string; played: number; wins: number; draws: number;
    losses: number; goals: number; assists: number; mvps: number }>();
  let fixtures = 0, goals = 0;
  for (const row of history) {
    const sports = row.event_sports?.data;
    if (!sports || validateSports(row.data, sports)) continue;
    const names = new Map(row.event_rsvps.map(p => [p.player_id, p.player.name]));
    for (const fixture of sports.fixtures) {
      const sides = fixtureParticipants(row.data, fixture);
      const poll = row.fixture_polls?.find(p => p.fixture_id === fixture.id);
      const winners = poll ? (poll.closed_at ? poll.winner_player_ids : []) : (fixture.mvpPlayerId ? [fixture.mvpPlayerId] : []);
      fixtures++; goals += fixture.homeScore + fixture.awayScore;
      for (const [ids, forGoals, againstGoals] of [
        [sides.home, fixture.homeScore, fixture.awayScore], [sides.away, fixture.awayScore, fixture.homeScore]
      ] as const) {
        for (const id of ids) {
          const player = players.get(id) ?? { id, name: 'Jugador sin nombre', played: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, mvps: 0 };
          player.name = names.get(id) || player.name;
          player.played++;
          player.wins += Number(forGoals > againstGoals);
          player.draws += Number(forGoals === againstGoals);
          player.losses += Number(forGoals < againstGoals);
          const performance = fixture.players.find(p => p.playerId === id);
          player.goals += performance?.goals ?? 0;
          player.assists += performance?.assists ?? 0;
          player.mvps += Number(winners.includes(id));
          players.set(id, player);
        }
      }
    }
  }
  return { fixtures, goals, players: [...players.values()] };
}
