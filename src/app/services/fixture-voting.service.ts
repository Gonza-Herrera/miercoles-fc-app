import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { FixturePoll, FixtureVote } from '../models/sports.model';

type PendingVote = { kind: 'vote'; candidate: string; version: number; operation: string; userId: string };
type PendingClose = { kind: 'close'; userId: string };

@Injectable()
export class FixtureVotingService {
  private client = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private controller?: AbortController;
  private eventId = '';
  private fixtureId = '';
  private generation = 0;
  private pending?: PendingVote | PendingClose;
  readonly poll = signal<FixturePoll | null>(null);
  readonly vote = signal<FixtureVote | null>(null);
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly saving = signal(false);
  readonly canRetry = signal(false);
  readonly conflict = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor() { inject(DestroyRef).onDestroy(() => this.controller?.abort()); }

  async load(eventId: string, fixtureId: string): Promise<boolean> {
    if (this.saving()) return false;
    if (this.eventId !== eventId || this.fixtureId !== fixtureId) {
      this.poll.set(null); this.vote.set(null); this.ready.set(false);
      this.pending = undefined; this.canRetry.set(false); this.conflict.set(false);
    }
    this.eventId = eventId; this.fixtureId = fixtureId;
    this.controller?.abort();
    const controller = new AbortController(); this.controller = controller;
    const generation = ++this.generation;
    this.loading.set(true); this.error.set(null);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const [pollResult, voteResult] = await Promise.all([
        this.client.from('fixture_polls').select('*').eq('event_id', eventId).eq('fixture_id', fixtureId)
          .abortSignal(controller.signal).maybeSingle(),
        this.client.from('fixture_votes').select('*').eq('event_id', eventId).eq('fixture_id', fixtureId)
          .eq('voter_id', this.auth.currentUser()?.id ?? '').abortSignal(controller.signal).maybeSingle()
      ]);
      if (pollResult.error || voteResult.error || controller.signal.aborted) throw new Error('No se pudo consultar la votación.');
      if (generation !== this.generation) return false;
      this.poll.set(pollResult.data as FixturePoll | null); this.vote.set(voteResult.data as FixtureVote | null);
      this.ready.set(true);
      if (this.conflict()) { this.conflict.set(false); this.pending = undefined; }
      return true;
    } catch {
      if (generation === this.generation) this.error.set('No pudimos actualizar la votación. Intentá nuevamente.');
      return false;
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async cast(candidate: string) {
    const user = this.auth.currentUser()?.id;
    const poll = this.poll();
    if (!user || !this.ready() || this.loading() || this.saving() || this.canRetry() || this.conflict() ||
      !poll || poll.closed_at || candidate === user || !poll.eligible_player_ids.includes(user) || !poll.eligible_player_ids.includes(candidate)) return false;
    this.pending = { kind: 'vote', candidate, version: this.vote()?.version ?? -1, operation: crypto.randomUUID(), userId: user };
    return this.persist();
  }

  async close() {
    const user = this.auth.currentUser()?.id;
    if (!user || !this.auth.isAdmin() || !this.ready() || this.loading() || this.saving() || this.canRetry() || this.conflict() || !this.poll() || this.poll()?.closed_at) return false;
    this.pending = { kind: 'close', userId: user };
    return this.persist();
  }

  retry() { return this.canRetry() ? this.persist() : Promise.resolve(false); }

  private async persist(): Promise<boolean> {
    const pending = this.pending;
    if (!pending || this.saving() || pending.userId !== this.auth.currentUser()?.id || (pending.kind === 'close' && !this.auth.isAdmin())) return false;
    this.saving.set(true); this.error.set(null); this.notice.set(null); this.canRetry.set(false);
    this.controller?.abort(); ++this.generation; this.loading.set(false);
    try {
      const request = pending.kind === 'vote'
        ? this.client.rpc('cast_fixture_vote', { p_event_id: this.eventId, p_fixture_id: this.fixtureId,
          p_candidate_id: pending.candidate, p_version: pending.version, p_operation: pending.operation })
        : this.client.rpc('close_fixture_poll', { p_event_id: this.eventId, p_fixture_id: this.fixtureId });
      const { data, error } = await request.abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!data?.[0]) throw new Error('Sin confirmación');
      if (pending.kind === 'vote') this.vote.set(data[0] as FixtureVote);
      else this.poll.set(data[0] as FixturePoll);
      this.pending = undefined;
      this.notice.set(pending.kind === 'vote' ? 'Voto guardado' : 'Votación cerrada');
      return true;
    } catch (error: any) {
      this.conflict.set(error?.code === '40001'); this.canRetry.set(!error?.code);
      this.error.set(error?.code === '40001' ? 'Tu voto cambió en otra sesión. Actualizá antes de continuar.' :
        error?.code ? (error.message || 'No pudimos guardar la elección.') : 'No pudimos confirmar el guardado. Reintentá el mismo envío.');
      return false;
    } finally { this.saving.set(false); }
  }
}
