import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { FixtureVotingService } from '../../services/fixture-voting.service';

@Component({
  selector: 'app-fixture-voting', standalone: true,
  imports: [CommonModule, FormsModule], providers: [FixtureVotingService],
  template: `
    <section class="voting" aria-label="Jugador del partido">
      <h3>⭐ Jugador del partido</h3>
      @if (!data.ready() && data.loading()) { <p role="status">Cargando votación…</p> }
      @else if (data.ready()) {
        @if (data.poll(); as poll) {
          @if (poll.closed_at) {
            <p><strong>Votación cerrada</strong> · {{ poll.vote_count }} votos</p>
            @if (poll.winner_player_ids.length) {
              <p>{{ poll.winner_player_ids.length > 1 ? 'Figuras compartidas:' : 'Figura del partido:' }}</p>
              @for (id of poll.winner_player_ids; track id) { <strong class="winner">⭐ {{ name(id) }}</strong> }
            } @else { <p>No hubo votos. Este cruce no suma figuras al ranking.</p> }
          } @else {
            <p>Votación abierta. Los resultados se muestran cuando el admin la cierre.</p>
            @if (canVote()) {
              <label>Elegí a otro participante
                <select [ngModel]="selection()" (ngModelChange)="selection.set($event)" [disabled]="busy()">
                  <option value="">Seleccionar jugador</option>
                  @for (player of candidates(); track player.id) { <option [value]="player.id">{{ player.name }}</option> }
                </select>
              </label>
              <button class="btn btn-primary" [disabled]="busy() || !selection() || selection() === ownChoice()" (click)="data.cast(selection())">
                {{ data.vote() ? 'Cambiar mi voto' : 'Guardar mi voto' }}
              </button>
            } @else { <p>Solo pueden votar quienes jugaron este cruce. No se permite votarse a uno mismo.</p> }
            @if (auth.isAdmin()) {
              @if (confirmClose()) {
                <p>El cierre es definitivo y publica las figuras, incluyendo los empates. Si no hay votos, no se asignará figura.</p>
                <div class="actions"><button class="btn btn-secondary" [disabled]="busy()" (click)="confirmClose.set(false)">Cancelar</button><button class="btn btn-primary" [disabled]="busy()" (click)="close()">Confirmar cierre</button></div>
              } @else {
                <button class="btn btn-secondary" [disabled]="busy()" (click)="confirmClose.set(true)">Cerrar votación</button>
              }
            }
          }
          @if (data.vote()) { <small>Tu voto: {{ name(data.vote()!.candidate_id) }}{{ poll.closed_at ? '' : '. Podés cambiarlo hasta el cierre.' }}</small> }
        } @else {
          @if (legacyMvp()) { <p><strong>⭐ {{ name(legacyMvp()!) }}</strong></p><small>Elección histórica del admin. Los nuevos cruces usan votación.</small> }
          @else { <p>Este cruce histórico no tiene una figura asignada.</p> }
        }
      }
      @if (!data.ready() && !data.loading()) { <p>No pudimos consultar la votación. Actualizá para volver a intentar.</p> }
      @if (data.saving()) { <p role="status">Guardando…</p> }
      @if (data.conflict()) { <p>Hay cambios en tu voto desde otra sesión. Actualizá para revisarlos.</p> }
      @if (data.canRetry()) { <button class="btn btn-primary" [disabled]="data.saving()" (click)="data.retry()">Reintentar el mismo envío</button> }
      @if (feedbackVisible()) { <p class="feedback" [class.error]="data.error()" [attr.role]="data.error() ? 'alert' : 'status'">{{ data.error() || data.notice() }}</p> }
      <button class="refresh" [disabled]="data.loading() || data.saving()" (click)="refresh()">Actualizar votación</button>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .voting { margin-top: 18px; border-top: 1px solid var(--border-color); padding-top: 16px; }
    h3 { font-size: 1rem; margin: 0 0 12px; }
    p, small { font-size: .85rem; line-height: 1.5; }
    small { display: block; color: var(--text-muted); margin: 12px 0; }
    label { display: flex; flex-direction: column; gap: 8px; font-size: .85rem; }
    select { width: 100%; min-width: 0; max-width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; background: white; color: var(--text-main); font: inherit; font-size: 16px; }
    .btn { width: 100%; margin-top: 12px; min-height: 44px; }
    .winner { display: block; background: #FFFBEB; padding: 10px; border-radius: 8px; margin: 8px 0; }
    .actions { display: flex; gap: 8px; }
    .actions button { flex: 1; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .refresh { display: block; margin: 16px auto 0; padding: 8px; background: transparent; border: 0; color: var(--primary); font: inherit; font-size: .8rem; cursor: pointer; }
    .feedback { background: #ECFDF5; color: #065F46; border-radius: 8px; padding: 10px; }
    .feedback.error { background: #FFF1F2; color: #9F1239; }
  `]
})
export class FixtureVotingComponent {
  readonly eventId = input.required<string>();
  readonly fixtureId = input.required<string>();
  readonly participants = input.required<{ id: string; name: string }[]>();
  readonly legacyMvp = input<string | null>(null);
  readonly data = inject(FixtureVotingService);
  readonly auth = inject(AuthService);
  readonly selection = signal('');
  readonly confirmClose = signal(false);
  readonly feedbackVisible = signal(false);
  readonly ownChoice = computed(() => this.data.vote()?.candidate_id ?? '');
  readonly canVote = computed(() => !!this.auth.currentUser()?.id &&
    !!this.data.poll()?.eligible_player_ids.includes(this.auth.currentUser()!.id));
  readonly busy = computed(() => this.data.loading() || this.data.saving() || this.data.canRetry() || this.data.conflict());
  readonly candidates = computed(() => this.participants().filter(player => player.id !== this.auth.currentUser()?.id &&
    this.data.poll()?.eligible_player_ids.includes(player.id)));

  constructor() {
    effect(() => {
      const eventId = this.eventId(), fixtureId = this.fixtureId();
      untracked(() => { void this.data.load(eventId, fixtureId); });
    });
    effect(() => this.selection.set(this.ownChoice()));
    effect(onCleanup => {
      const message = this.data.error() || this.data.notice();
      this.feedbackVisible.set(!!message);
      if (message) { const timer = setTimeout(() => this.feedbackVisible.set(false), 3000); onCleanup(() => clearTimeout(timer)); }
    });
    const refresh = () => {
      if (!this.data.loading() && !this.data.saving() && !this.data.canRetry() && !this.data.conflict()) void this.refresh();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); window.removeEventListener('focus', refresh); });
  }
  name(id: string) { return this.participants().find(player => player.id === id)?.name ?? 'Jugador'; }
  refresh() { return this.data.load(this.eventId(), this.fixtureId()); }
  async close() { if (await this.data.close()) this.confirmClose.set(false); }
}
