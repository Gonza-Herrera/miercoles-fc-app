import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { SportsResultsService } from '../../services/sports-results.service';
import { MatchResult } from '../../models/sports.model';
import { fixtureParticipants, validateSports } from '../../utils/sports-statistics';

type ResultDraft = Omit<MatchResult, 'homeScore' | 'awayScore'> & { homeScore: number | null; awayScore: number | null };

@Component({
  selector: 'app-match-results', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], providers: [SportsResultsService],
  templateUrl: './match-results.component.html', styleUrl: './match-results.component.css'
})
export class MatchResultsComponent {
  readonly data = inject(SportsResultsService);
  readonly auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  readonly feedbackVisible = signal(false);
  readonly teams = computed(() => this.data.event()?.data.teams?.teams ?? []);
  readonly fixtures = computed(() => this.data.record()?.data.fixtures ?? []);
  readonly canEdit = computed(() => this.auth.isAdmin() && ['dinner', 'completed'].includes(this.data.event()?.data.status ?? ''));
  draft: ResultDraft | null = null;
  formError = '';
  removalId: string | null = null;
  private eventId = '';

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.eventId = params.get('eventId') ?? '';
      this.draft = null; this.removalId = null;
      void this.data.load(this.eventId);
    });
    effect(onCleanup => {
      const message = this.data.error() || this.data.notice();
      this.feedbackVisible.set(!!message);
      if (message) {
        const timer = setTimeout(() => this.feedbackVisible.set(false), 3000);
        onCleanup(() => clearTimeout(timer));
      }
    });
  }

  teamName(id: string) { return this.teams().find(team => team.id === id)?.name ?? 'Equipo'; }
  playerName(id: string) {
    return this.data.event()?.event_rsvps.find(p => p.player_id === id)?.player.name ?? 'Jugador sin nombre';
  }
  participants(fixture: Pick<MatchResult, 'homeTeamId' | 'awayTeamId'>) {
    const event = this.data.event()?.data;
    if (!event) return [];
    const sides = fixtureParticipants(event, fixture);
    return [...sides.home, ...sides.away].map(id => ({ id, name: this.playerName(id),
      team: sides.home.includes(id) ? this.teamName(fixture.homeTeamId) : this.teamName(fixture.awayTeamId) }));
  }
  edit(fixture?: MatchResult) {
    if (!this.canEdit() || this.data.saving() || this.data.canRetry() || this.data.conflict()) return;
    this.formError = ''; this.removalId = null;
    this.draft = fixture ? structuredClone(fixture) : { id: crypto.randomUUID(),
      homeTeamId: this.teams()[0]?.id ?? '', awayTeamId: this.teams()[1]?.id ?? '',
      homeScore: null, awayScore: null, players: [], mvpPlayerId: null };
    this.syncPlayers();
  }
  changeTeams() {
    if (!this.draft) return;
    this.draft.homeScore = null; this.draft.awayScore = null;
    this.draft.players = []; this.draft.mvpPlayerId = null;
    this.syncPlayers();
  }
  private syncPlayers() {
    if (!this.draft) return;
    const previous = this.draft.players;
    this.draft.players = this.participants(this.draft).map(player =>
      previous.find(p => p.playerId === player.id) ?? { playerId: player.id, goals: 0, assists: 0 });
  }
  playerTeam(id: string) {
    return this.draft ? this.participants(this.draft).find(p => p.id === id)?.team : '';
  }
  async save() {
    if (!this.draft || !this.canEdit()) return;
    if (this.draft.homeScore === null || this.draft.awayScore === null) {
      this.formError = 'Completá ambos marcadores, incluso si terminaron en cero.'; return;
    }
    const fixture: MatchResult = { ...this.draft, homeScore: this.draft.homeScore, awayScore: this.draft.awayScore,
      players: this.draft.players.map(p => ({ ...p, goals: p.goals ?? 0, assists: p.assists ?? 0 })) };
    const fixtures = [...this.fixtures().filter(f => f.id !== fixture.id), fixture];
    this.formError = validateSports(this.data.event()!.data, { fixtures }) ?? '';
    if (this.formError) return;
    if (await this.data.save({ fixtures })) this.draft = null;
  }
  async remove() {
    if (!this.removalId || !this.canEdit()) return;
    if (await this.data.save({ fixtures: this.fixtures().filter(f => f.id !== this.removalId) })) this.removalId = null;
  }
  async retry() {
    if (await this.data.retry()) { this.draft = null; this.removalId = null; }
  }
  async reload() {
    if (await this.data.load(this.eventId)) { this.draft = null; this.removalId = null; this.formError = ''; }
  }
}
