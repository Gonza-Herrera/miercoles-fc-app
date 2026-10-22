import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';
import { captainDraftState } from '../../utils/captain-draft';
import { Team } from '../../models/event.model';

@Component({
  standalone: true, selector: 'app-captain-draft', imports: [FormsModule, RouterLink],
  templateUrl: './captain-draft.component.html', styleUrl: './captain-draft.component.css'
})
export class CaptainDraftComponent {
  readonly state = inject(EventStateService);
  readonly auth = inject(AuthService);
  readonly event = this.state.currentEvent;
  readonly draft = computed(() => captainDraftState(this.event()));
  readonly open = computed(() => this.event().status === 'open');
  readonly myTurn = computed(() => this.open() && !this.draft().departed.length && this.draft().confirmed.length >= 8 &&
    this.draft().nextTeam?.captainPlayerId === this.auth.currentUser()?.id);
  readonly pending = signal<'manual' | 'random' | 'classic' | null>(null);
  captainA = ''; captainB = ''; replacements: Record<string, string> = {};
  readonly roles = ['ARQ', 'DEF', 'MED', 'DEL'];
  name(id: string) { return this.state.getPlayer(id).name; }
  canPosition(team: Team) { return this.open() && (this.auth.isAdmin() || team.captainPlayerId === this.auth.currentUser()?.id); }
  replacementChoices(team: Team, id: string) {
    return team.captainPlayerId === id
      ? [...this.draft().available, ...team.playerIds.filter(p => p !== id && this.draft().confirmed.includes(p))]
      : this.draft().available;
  }
  async confirmSetup() {
    const action = this.pending(); if (!action) return;
    if (await this.state.captainAction(action, action === 'manual' ? { captainAId: this.captainA, captainBId: this.captainB } : {})) this.pending.set(null);
  }
  async position(playerId: string, role: string) { await this.state.captainAction('position', { playerId, role }); }
  async replace(outgoingId: string) {
    const playerId = this.replacements[outgoingId]; if (!playerId) return;
    if (await this.state.captainAction('replace', { outgoingId, playerId })) delete this.replacements[outgoingId];
  }
}
