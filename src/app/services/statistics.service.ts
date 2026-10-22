import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ProfileService } from './profile.service';
import { SupabaseService } from './supabase.service';
import { HistoricalEvent } from '../utils/event-statistics';

// Provided by the statistics page, so leaving it disposes its data and requests.
@Injectable()
export class StatisticsService {
  private profiles = inject(ProfileService);
  private client = inject(SupabaseService).client;
  private controller?: AbortController;
  readonly history = signal<HistoricalEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }

  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set(null);
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const history: HistoricalEvent[] = [];
      const pageSize = 200;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await this.client.from('event_records')
          .select('id, data, event_rsvps(player_id, player), event_sports(data), fixture_polls(*)')
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(offset, offset + pageSize - 1).returns<HistoricalEvent[]>().abortSignal(controller.signal);
        if (error) throw error;
        history.push(...(data ?? []) as HistoricalEvent[]);
        if ((data?.length ?? 0) < pageSize) break;
      }
      if (controller.signal.aborted) throw new Error('La consulta tardó demasiado.');
      await this.profiles.load();
      for (const event of history) event.event_rsvps = event.event_rsvps.map(r => ({ ...r, player: this.profiles.player({ ...r.player, id: r.player_id }) }));
      if (controller.signal.aborted) return;
      this.history.set(history);
    } catch {
      if (this.controller === controller) {
        this.history.set([]);
        this.error.set('No pudimos cargar las estadísticas. Intentá nuevamente.');
      }
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.loading.set(false);
    }
  }
}
