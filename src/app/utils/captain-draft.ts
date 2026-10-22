import { SoccerEvent, Team } from '../models/event.model';

/** Same balance and eligibility rules as the atomic captain_action RPC. */
export function captainDraftState(event: SoccerEvent) {
  const teams = event.teams?.teams ?? [];
  const confirmed = Object.values(event.attendances).filter(a => a.playsSoccer).map(a => a.playerId);
  const assigned = teams.flatMap(t => t.playerIds);
  const available = confirmed.filter(id => !assigned.includes(id));
  const departed = assigned.filter(id => !confirmed.includes(id));
  let nextTeam: Team | undefined;
  if (event.captainDraft && teams.length === 2) {
    nextTeam = teams[0].playerIds.length < teams[1].playerIds.length ? teams[0]
      : teams[1].playerIds.length < teams[0].playerIds.length ? teams[1]
      : teams.find(t => t.id === event.captainDraft!.nextTeamId);
  }
  const ready = !!event.captainDraft && confirmed.length >= 8 && teams.length === 2 &&
    !available.length && !departed.length && new Set(assigned).size === assigned.length &&
    teams.every(t => t.playerIds.length >= 4 && !!t.captainPlayerId && t.playerIds.includes(t.captainPlayerId)) &&
    Math.abs(teams[0].playerIds.length - teams[1].playerIds.length) <= 1;
  return { teams, confirmed, available, departed, nextTeam, ready };
}
