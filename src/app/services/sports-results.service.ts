import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { HistoricalEvent } from '../utils/event-statistics';
import { EventSports, SportsRecord } from '../models/sports.model';
import { validateSports } from '../utils/sports-statistics';

@Injectable()
export class SportsResultsService {
  private client = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private controller?: AbortController;
  private attempt?: { eventId: string; version: number; data: EventSports; operation: string };
  readonly event = signal<HistoricalEvent | null>(null);
  readonly record = signal<SportsRecord | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly canRetry = signal(false);
  readonly conflict = signal(false);

  constructor() { inject(DestroyRef).onDestroy(() => this.controller?.abort()); }

  async load(eventId: string): Promise<boolean> {
    if (this.saving()) return false;
    if (this.event()?.id !== eventId) { this.event.set(null); this.record.set(null); }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true); this.error.set(null); this.notice.set(null);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await this.client.from('event_records')
        .select('id, data, event_rsvps(player_id, player), event_sports(*)')
        .eq('id', eventId).returns<(HistoricalEvent & { event_sports: SportsRecord | null })[]>()
        .abortSignal(controller.signal).maybeSingle();
      if (error) throw error;
      if (controller.signal.aborted) throw new Error('Tiempo agotado');
      if (!data) throw new Error('No encontramos el evento.');
      this.event.set(data as HistoricalEvent);
      this.record.set(data.event_sports as SportsRecord | null);
      this.attempt = undefined; this.canRetry.set(false); this.conflict.set(false);
      return true;
    } catch {
      if (this.controller === controller) this.error.set('No pudimos cargar los resultados. Actualizá para intentar nuevamente.');
      return false;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.loading.set(false);
    }
  }

  async save(data: EventSports): Promise<boolean> {
    if (!this.auth.isAdmin() || !this.event() || this.loading() || this.saving() || this.canRetry() || this.conflict()) return false;
    const error = validateSports(this.event()!.data, data);
    if (error) { this.error.set(error); return false; }
    for (const fixture of data.fixtures) {
      const previous = this.record()?.data.fixtures.find(saved => saved.id === fixture.id);
      if (!previous && fixture.mvpPlayerId) {
        this.error.set('La figura de los nuevos cruces se elige por votación.'); return false;
      }
      if (previous && (previous.mvpPlayerId ?? null) !== (fixture.mvpPlayerId ?? null)) {
        this.error.set('Las figuras históricas del admin no se modifican.'); return false;
      }
    }
    this.attempt = { eventId: this.event()!.id, version: this.record()?.version ?? -1,
      data: structuredClone(data), operation: crypto.randomUUID() };
    return this.persist();
  }

  retry() { return this.canRetry() ? this.persist() : Promise.resolve(false); }

  private async persist(): Promise<boolean> {
    if (!this.auth.isAdmin() || !this.attempt || this.saving()) return false;
    const attempt = this.attempt;
    this.saving.set(true); this.error.set(null); this.notice.set(null); this.canRetry.set(false);
    try {
      const { data, error } = await this.client.rpc('save_event_sports', {
        p_event_id: attempt.eventId, p_version: attempt.version, p_data: attempt.data, p_operation: attempt.operation
      }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!data?.[0]) throw new Error('Sin confirmación');
      this.record.set(data[0] as SportsRecord);
      this.attempt = undefined;
      this.notice.set('Resultados guardados');
      return true;
    } catch (error: any) {
      this.conflict.set(error?.code === '40001');
      this.canRetry.set(!error?.code);
      this.error.set(error?.code === '40001' ? 'Los resultados cambiaron en otra sesión. Actualizá y revisá los datos.' :
        error?.code ? (error.message || 'No pudimos guardar los resultados.') : 'No pudimos confirmar el guardado. Reintentá o actualizá los datos.');
      return false;
    } finally { this.saving.set(false); }
  }
}
