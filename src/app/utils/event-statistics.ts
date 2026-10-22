import { Player, SoccerEvent } from '../models/event.model';
import { EventSports, FixturePoll } from '../models/sports.model';
import { calculateSportsStatistics } from './sports-statistics';

export type StatisticsPeriod = 'month' | 'year' | 'all';
export interface HistoricalEvent {
  id: string;
  data: SoccerEvent;
  event_rsvps: { player_id: string; player: Player }[];
  event_sports?: { data: EventSports } | null;
  fixture_polls?: FixturePoll[];
}

export function selectStatisticsHistory(history: HistoricalEvent[], period: StatisticsPeriod, today = new Date()) {
  const year = String(today.getFullYear());
  const month = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return history.filter(({ data }) => /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
    (period === 'all' || data.date.startsWith(period === 'month' ? month : `${year}-`)))
    .sort((a, b) => a.data.date.localeCompare(b.data.date) || a.id.localeCompare(b.id));
}

export function calculateStatistics(history: HistoricalEvent[], period: StatisticsPeriod, today = new Date()) {
  const players = new Map<string, { id: string; name: string; matches: number; dinners: number; participations: number }>();
  const months = new Map<string, { month: string; matches: number; dinners: number; players: number; diners: number }>();
  let matches = 0, dinners = 0, matchAttendances = 0, dinnerAttendances = 0;
  let pitchCents = 0, dinnerCents = 0;
  // Ascending order lets the most recent recorded name win across historical snapshots.
  const selected = selectStatisticsHistory(history, period, today);
  for (const row of selected) {
    const event = row.data;
    const matchClosed = ['dinner', 'completed'].includes(event.status);
    const dinnerClosed = event.status === 'completed';
    if (!matchClosed && !dinnerClosed) continue;
    const played = new Set(matchClosed ? event.matchPlayedPlayerIds ?? [] : []);
    const ate = new Set(dinnerClosed ? event.dinnerAttendedPlayerIds ?? [] : []);
    const key = event.date.slice(0, 7);
    const monthly = months.get(key) ?? { month: key, matches: 0, dinners: 0, players: 0, diners: 0 };
    // A closed stage with zero attendees isn't a played match or a shared dinner.
    if (played.size) {
      matches++; matchAttendances += played.size;
      pitchCents += Math.round(event.pitchPrice * 100);
      monthly.matches++; monthly.players += played.size;
    }
    if (ate.size) {
      dinners++; dinnerAttendances += ate.size;
      dinnerCents += (event.menuItems ?? []).reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
      monthly.dinners++; monthly.diners += ate.size;
    }
    if (played.size || ate.size) months.set(key, monthly);
    const names = new Map(row.event_rsvps.map(rsvp => [rsvp.player_id, rsvp.player.name]));
    for (const id of new Set([...played, ...ate])) {
      const player = players.get(id) ?? { id, name: 'Jugador sin nombre', matches: 0, dinners: 0, participations: 0 };
      player.name = names.get(id) || player.name;
      player.matches += Number(played.has(id));
      player.dinners += Number(ate.has(id));
      player.participations++;
      players.set(id, player);
    }
  }
  return {
    matches, dinners, matchAttendances, dinnerAttendances,
    averagePlayers: matches ? matchAttendances / matches : null,
    averagePitchCost: matchAttendances ? pitchCents / 100 / matchAttendances : null,
    averageDinnerCost: dinnerAttendances ? dinnerCents / 100 / dinnerAttendances : null,
    totalDinnerCost: dinnerCents / 100,
    sports: calculateSportsStatistics(selected),
    players: [...players.values()],
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month))
  };
}
