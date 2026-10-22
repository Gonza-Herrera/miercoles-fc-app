import { Injectable, inject, signal, computed, effect, DestroyRef, untracked } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ProfileService } from './profile.service';
import { AuthService } from './auth.service';
import { Player, SoccerEvent, AttendanceStatus, MenuItem, Team, PaymentRecord, PaymentKind } from '../models/event.model';

@Injectable({
  providedIn: 'root'
})
export class EventStateService {
  private profiles = inject(ProfileService);
  private auth = inject(AuthService);
  private sb = inject(SupabaseService).client;
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentUser = computed<Player>(() => {
    const user = this.auth.currentUser();
    return {
      id: user?.id ?? '', name: user?.name ?? 'Jugador',
      avatar: user?.avatarUrl ?? '', role: 'MED'
    };
  });
  readonly players = signal<Player[]>([]);
  // An empty model keeps derived totals safe; hasEvent controls access to event screens.
  readonly currentEvent = signal<SoccerEvent>(this.emptyEvent());
  readonly hasEvent = computed(() => !!this.currentEvent().id);
  private loaded = false;
  private revision = 0;
  private pendingLoad: Promise<void> | null = null;
  readonly saving = signal(false);
  readonly canRetry = signal(false);
  readonly notice = signal<string | null>(null);
  readonly payments = signal<PaymentRecord[]>([]);
  private version = 0;
  private retryAction: (() => Promise<boolean>) | null = null;
  readonly matchClosed = computed(() => ['dinner', 'completed'].includes(this.currentEvent().status));
  readonly dinnerClosed = computed(() => this.currentEvent().status === 'completed');
  readonly canEditTeams = computed(() => this.auth.isAdmin() && this.currentEvent().status === 'open' && !this.currentEvent().captainDraft);
  readonly canEditDinner = computed(() => this.auth.isAdmin() && !this.dinnerClosed());

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        untracked(() => { void this.loadEvent(); });
      } else {
        this.currentEvent.set(this.emptyEvent());
        this.players.set([]);
        this.payments.set([]);
        this.retryAction = null;
        this.canRetry.set(false);
        this.loaded = false;
        this.loading.set(false);
      }
    });
    const refresh = () => { if (this.auth.isLoggedIn()) void this.loadEvent(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    });
  }

  private emptyEvent(): SoccerEvent {
    return {
      id: '', title: '', date: '', time: '', location: '', pitchPrice: 0,
      dinnerTitle: '', status: 'open', attendances: {},
      matchPlayedPlayerIds: [], matchPaidPlayerIds: [], menuItems: [],
      dinnerAttendedPlayerIds: [], dinnerPaidPlayerIds: []
    };
  }

  loadEvent(): Promise<void> {
    if (this.saving()) return Promise.resolve();
    if (this.pendingLoad) return this.pendingLoad;
    const userId = this.auth.currentUser()?.id;
    if (!userId) return Promise.resolve();
    this.pendingLoad = this.fetchEvent(userId).finally(() => { this.pendingLoad = null; });
    return this.pendingLoad;
  }

  private async fetchEvent(userId: string): Promise<void> {
    if (!this.loaded) this.loading.set(true);
    const revision = this.revision;
    try {
      const { data, error } = await this.sb.from('event_records')
        .select('id, data, version').order('created_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
      if (error) throw error;
      if (this.auth.currentUser()?.id !== userId) return;
      if (!data) {
        this.currentEvent.set(this.emptyEvent());
        this.players.set([]);
        return;
      }
      await this.profiles.load();
      const { data: confirmations, error: attendanceError } = await this.sb.from('event_rsvps')
        .select('*').eq('event_id', data.id).abortSignal(AbortSignal.timeout(15000));
      if (attendanceError) throw attendanceError;
      if (this.auth.currentUser()?.id !== userId) return;
      const { data: payments, error: paymentsError } = await this.sb.from('event_payments').select('*').eq('event_id', data.id).abortSignal(AbortSignal.timeout(15000));
      if (paymentsError) throw paymentsError;
      const attendances: SoccerEvent['attendances'] = {};
      const players: Player[] = [];
      for (const row of confirmations ?? []) {
        attendances[row.player_id] = {
          playerId: row.player_id, playsSoccer: row.plays_soccer,
          attendsDinner: row.attends_dinner, confirmedAt: row.confirmed_at
        };
        players.push(this.profiles.player({ ...row.player, id: row.player_id, role: data.data.playerRoles?.[row.player_id] ?? row.player.role } as Player));
      }
      if (revision !== this.revision || this.saving() || this.auth.currentUser()?.id !== userId) return;
      this.players.set(players);
      this.payments.set((payments ?? []).map(p => ({ ...p, amount: Number(p.amount) })));
      this.version = data.version;
      this.applyRecord(data, attendances);
    } catch {
      this.error.set('No pudimos cargar el evento. Intentá nuevamente.');
    } finally {
      this.loaded = true;
      this.loading.set(false);
    }
  }

  private applyRecord(row: { id: string; data: Partial<SoccerEvent>; version: number }, attendances = this.currentEvent().attendances) {
    this.version = row.version;
    this.currentEvent.set({ ...this.emptyEvent(), ...row.data, id: row.id, attendances,
      matchPaidPlayerIds: this.activePayments('pitch').map(p => p.player_id),
      dinnerPaidPlayerIds: this.activePayments('dinner').map(p => p.player_id)
    });
  }

  private async runSave(work: () => Promise<void>): Promise<boolean> {
    if (this.saving()) return false;
    const userId = this.auth.currentUser()?.id;
    this.saving.set(true);
    this.revision++;
    this.error.set(null);
    this.notice.set(null);
    this.canRetry.set(false);
    this.retryAction = null;
    try {
      await work();
      this.notice.set('Cambios guardados');
      return true;
    } catch (error: any) {
      const conflict = error?.code === '40001';
      this.error.set(conflict ? 'El evento cambió en otra sesión. Actualizá y revisá los datos antes de guardar.' :
        error?.code ? (error.message || 'No pudimos guardar los cambios.') : 'No pudimos confirmar el guardado. Revisá la conexión y reintentá.');
      if (!error?.code) {
        this.retryAction = () => this.auth.currentUser()?.id === userId ? this.runSave(work) : Promise.resolve(false);
        this.canRetry.set(true);
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  retryLastSave() { return this.retryAction?.() ?? Promise.resolve(false); }
  async refreshAfterError() {
    this.error.set(null);
    this.canRetry.set(false);
    this.retryAction = null;
    await this.loadEvent();
  }
  dismissNotice() { this.notice.set(null); }

  getEventVersion(): number { return this.version; }

  updateEvent(update: (event: SoccerEvent) => SoccerEvent, expectedVersion = this.version): Promise<boolean> {
    if (!this.hasEvent() || !this.auth.isAdmin()) return Promise.resolve(false);
    const { id, attendances, matchPaidPlayerIds, dinnerPaidPlayerIds, ...data } = update(this.currentEvent());
    const version = expectedVersion;
    const operation = crypto.randomUUID();
    return this.runSave(async () => {
      const { data: rows, error } = await this.sb.rpc('save_event', {
        p_event_id: id, p_version: version, p_data: data, p_operation: operation
      }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!rows?.[0]) throw new Error('No se recibió confirmación.');
      this.applyRecord(rows[0], attendances);
      this.players.update(players => players.map(player => ({ ...player, role: rows[0].data.playerRoles?.[player.id] ?? player.role })));
    });
  }

  captainAction(action: 'manual' | 'random' | 'pick' | 'replace' | 'remove' | 'move' | 'position' | 'confirm' | 'classic', payload: Record<string, string> = {}): Promise<boolean> {
    if (!this.hasEvent() || !this.auth.isLoggedIn()) return Promise.resolve(false);
    const eventId = this.currentEvent().id, version = this.version, operation = crypto.randomUUID();
    const request = { ...payload };
    return this.runSave(async () => {
      const { data: rows, error } = await this.sb.rpc('captain_action', {
        p_event: eventId, p_version: version, p_operation: operation, p_action: action, p_payload: request
      }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (!rows?.[0]) throw new Error('No se recibió confirmación.');
      this.applyRecord(rows[0]);
      this.players.update(players => players.map(player => ({ ...player, role: rows[0].data.playerRoles?.[player.id] ?? player.role })));
    });
  }

  editEventDetails(
    data: Pick<SoccerEvent, 'title' | 'date' | 'time' | 'location' | 'pitchPrice'>,
    eventId: string,
    version: number
  ): Promise<boolean> {
    if (!this.auth.isAdmin() || !this.hasEvent()) return Promise.resolve(false);
    if (this.currentEvent().id !== eventId || this.dinnerClosed()) {
      this.error.set('El evento cambió o ya está finalizado. Volvé a Inicio y revisá sus datos.');
      return Promise.resolve(false);
    }
    if (!data.title.trim() || !data.location.trim() || !data.date || !data.time ||
        !Number.isFinite(data.pitchPrice) || data.pitchPrice <= 0) return Promise.resolve(false);
    if (this.matchClosed() && data.pitchPrice !== this.currentEvent().pitchPrice) {
      this.error.set('El precio de cancha no puede cambiar después de confirmar el reparto.');
      return Promise.resolve(false);
    }
    return this.updateEvent(evt => ({ ...evt, title: data.title.trim(), date: data.date,
      time: data.time, location: data.location.trim(), pitchPrice: data.pitchPrice }), version);
  }

  startMatch() {
    if (!this.auth.isAdmin()) return Promise.resolve(false);
    if (this.currentEvent().status !== 'open') return Promise.resolve(this.currentEvent().status === 'playing');
    if (!this.soccerConfirmedCount()) { this.error.set('Debe haber al menos un jugador confirmado para iniciar el partido.'); return Promise.resolve(false); }
    return this.updateEvent(evt => ({ ...evt, status: 'playing' }));
  }
  confirmMatch(playerIds: string[]) {
    if (this.currentEvent().status !== 'playing' || !playerIds.length) return Promise.resolve(false);
    return this.updateEvent(evt => ({ ...evt, matchPlayedPlayerIds: [...playerIds], status: 'dinner' }));
  }
  confirmDinner(playerIds: string[]) {
    if (this.currentEvent().status !== 'dinner' || !playerIds.length) return Promise.resolve(false);
    return this.updateEvent(evt => ({ ...evt, dinnerAttendedPlayerIds: [...playerIds], status: 'completed' }));
  }

  activePayments(kind: PaymentKind) { return this.payments().filter(p => p.kind === kind && !p.voided_at); }
  paymentFor(kind: PaymentKind, playerId: string) { return this.activePayments(kind).find(p => p.player_id === playerId); }
  shareFor(kind: PaymentKind, playerId: string): number {
    const ids = [...(kind === 'pitch' ? this.currentEvent().matchPlayedPlayerIds : this.currentEvent().dinnerAttendedPlayerIds)].sort();
    const pos = ids.indexOf(playerId);
    if (pos < 0 || !ids.length) return 0;
    const cents = Math.round((kind === 'pitch' ? this.currentEvent().pitchPrice : this.dinnerTotalAmount()) * 100);
    return (Math.floor(cents / ids.length) + (pos < cents % ids.length ? 1 : 0)) / 100;
  }
  setPayment(kind: PaymentKind, playerId: string, paid: boolean): Promise<boolean> {
    if (!this.auth.isAdmin() || !(kind === 'pitch' ? this.matchClosed() : this.dinnerClosed())) return Promise.resolve(false);
    const eventId = this.currentEvent().id;
    const operation = crypto.randomUUID();
    const paymentId = this.paymentFor(kind, playerId)?.id ?? null;
    return this.runSave(async () => {
      const { data, error } = await this.sb.rpc('set_event_payment', {
        p_event_id: eventId, p_kind: kind, p_player_id: playerId, p_paid: paid,
        p_operation: operation, p_payment_id: paymentId
      }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      this.payments.set((data ?? []).map((p: PaymentRecord) => ({ ...p, amount: Number(p.amount) })));
      this.currentEvent.update(evt => ({ ...evt,
        matchPaidPlayerIds: this.activePayments('pitch').map(p => p.player_id),
        dinnerPaidPlayerIds: this.activePayments('dinner').map(p => p.player_id)
      }));
    });
  }

  // Computed properties
  readonly soccerConfirmedCount = computed(() => {
    const att = this.currentEvent().attendances;
    return Object.values(att).filter(a => a.playsSoccer).length;
  });

  readonly dinnerConfirmedCount = computed(() => {
    const att = this.currentEvent().attendances;
    return Object.values(att).filter(a => a.attendsDinner).length;
  });

  // Before final confirmation, show the same dinner RSVPs used on Home.
  readonly dinnerAttendeeIds = computed(() => {
    const event = this.currentEvent();
    if (this.dinnerClosed() || event.dinnerAttendedPlayerIds.length) {
      return event.dinnerAttendedPlayerIds;
    }
    return Object.values(event.attendances).filter(a => a.attendsDinner).map(a => a.playerId);
  });

  readonly expectedSoccerPlayers = 10;
  readonly estimatedSoccerCostPerPlayer = computed(() =>
    Math.round(this.currentEvent().pitchPrice / this.expectedSoccerPlayers)
  );

  // Match calculations
  readonly matchCostPerPlayer = computed(() => {
    const count = this.currentEvent().matchPlayedPlayerIds.length;
    if (!count) return 0;
    return Math.round(this.currentEvent().pitchPrice / count);
  });

  readonly matchPaidCount = computed(() => this.currentEvent().matchPaidPlayerIds.length);
  readonly matchTotalCollected = computed(() => this.activePayments('pitch').reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100);
  readonly matchPendingAmount = computed(() => Math.max(0, Math.round((this.currentEvent().pitchPrice - this.matchTotalCollected()) * 100) / 100));

  // Dinner calculations
  readonly dinnerTotalAmount = computed(() => {
    return this.currentEvent().menuItems.reduce((acc, item) => acc + Math.round(item.amount * 100), 0) / 100;
  });

  readonly dinnerCostPerPerson = computed(() => {
    const count = this.currentEvent().dinnerAttendedPlayerIds.length;
    if (!count) return 0;
    return Math.round(this.dinnerTotalAmount() / count);
  });

  readonly dinnerPreviewAttendeeCount = computed(() =>
    this.dinnerAttendeeIds().length
  );

  readonly dinnerPreviewCostPerPerson = computed(() => {
    const count = this.dinnerPreviewAttendeeCount();
    return count ? Math.round(this.dinnerTotalAmount() / count) : 0;
  });

  readonly dinnerPaidCount = computed(() => this.currentEvent().dinnerPaidPlayerIds.length);
  readonly dinnerTotalCollected = computed(() => this.activePayments('dinner').reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100);
  readonly dinnerPendingAmount = computed(() => Math.max(0, Math.round((this.dinnerTotalAmount() - this.dinnerTotalCollected()) * 100) / 100));

  // Global total pending
  readonly totalPendingAmount = computed(() => this.matchPendingAmount() + this.dinnerPendingAmount());

  teamName(team: Team): string {
    const profile = team.captainPlayerId ? this.profiles.profiles()[team.captainPlayerId] : undefined;
    return profile ? `Equipo de ${profile.display_name}` : team.name;
  }

  // Helper methods to get player info
  getPlayer(id: string): Player {
    return this.players().find(p => p.id === id) || {
      id,
      name: 'Jugador',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      role: 'MED'
    };
  }

  getPlayerStatus(playerId: string): AttendanceStatus {
    const att = this.currentEvent().attendances[playerId];
    if (!att) return 'no_asiste';
    if (att.playsSoccer && att.attendsDinner) return 'juega_y_cena';
    if (att.playsSoccer) return 'solo_juega';
    if (att.attendsDinner) return 'solo_cena';
    return 'no_asiste';
  }

  // Actions
  async updateMyAttendance(playsSoccer: boolean, attendsDinner: boolean): Promise<boolean> {
    const event = this.currentEvent();
    const player = this.currentUser();
    if (!event.id || event.status !== 'open' || !player.id) return false;
    const attendance = { playerId: player.id, playsSoccer, attendsDinner, confirmedAt: new Date().toISOString() };
    return this.runSave(async () => {
      const { data, error } = await this.sb.from('event_rsvps').upsert({
        event_id: event.id, player_id: player.id, plays_soccer: playsSoccer,
        attends_dinner: attendsDinner, player, confirmed_at: attendance.confirmedAt
      }, { onConflict: 'event_id,player_id' }).select('player_id').abortSignal(AbortSignal.timeout(15000)).single();
      if (error) throw error;
      if (!data) throw new Error('No se recibió confirmación.');
      this.currentEvent.update(evt => ({ ...evt, attendances: { ...evt.attendances, [player.id]: attendance } }));
      this.players.update(players => players.some(p => p.id === player.id) ? players : [...players, player]);
    });
  }

  /**
   * Generación de equipos según la cantidad de jugadores confirmados:
   * Caso 6: 8 jugadores -> 2 equipos de 4
   * Caso 7: 9 jugadores -> 1 equipo de 5 y 1 de 4
   * Caso 1: 10 jugadores -> 2 equipos de 5
   * Caso 2: 11 jugadores -> 1 equipo de 6 y 1 de 5
   * Caso 3: 12 jugadores -> 2 equipos de 6
   * Caso 4: 13 a 15 jugadores -> 3 equipos de 5 (o distribuidos equilibrados)
   * Caso 5: >15 jugadores -> 4 equipos (Eq A: 5, Eq B: 5, Eq C: 5, Eq D: restantes)
   */
  getTeamPlan(playerCount: number): { teamCount: number; teamSizes: number[] } {
    if (playerCount <= 8) {
      return { teamCount: 2, teamSizes: [4, 4] };
    } else if (playerCount === 9) {
      return { teamCount: 2, teamSizes: [5, 4] };
    } else if (playerCount === 10) {
      return { teamCount: 2, teamSizes: [5, 5] };
    } else if (playerCount === 11) {
      return { teamCount: 2, teamSizes: [6, 5] };
    } else if (playerCount === 12) {
      return { teamCount: 2, teamSizes: [6, 6] };
    } else if (playerCount >= 13 && playerCount <= 15) {
      if (playerCount === 15) {
        return { teamCount: 3, teamSizes: [5, 5, 5] };
      } else if (playerCount === 14) {
        return { teamCount: 3, teamSizes: [5, 5, 4] };
      } else {
        return { teamCount: 3, teamSizes: [5, 4, 4] };
      }
    } else {
      // Caso 5: más de 15 jugadores -> 4 equipos (5, 5, 5 y restantes)
      const rest = playerCount - 15;
      return { teamCount: 4, teamSizes: [5, 5, 5, rest] };
    }
  }

  generateRandomTeams() {
    if (!this.canEditTeams()) return Promise.resolve(false);
    const event = this.currentEvent();
    const confirmedSoccerPlayerIds = Object.values(event.attendances)
      .filter(a => a.playsSoccer)
      .map(a => a.playerId);

    const shuffled = [...confirmedSoccerPlayerIds].sort(() => Math.random() - 0.5);
    const n = shuffled.length;
    const plan = this.getTeamPlan(n);

    const teamNames = ['Equipo A', 'Equipo B', 'Equipo C', 'Equipo D'];
    const teamIds = ['teamA', 'teamB', 'teamC', 'teamD'];

    const newTeams: Team[] = [];
    let currentIndex = 0;

    for (let i = 0; i < plan.teamCount; i++) {
      const size = plan.teamSizes[i] || 0;
      const slice = shuffled.slice(currentIndex, currentIndex + size);
      currentIndex += size;

      newTeams.push({
        id: teamIds[i] || `team_${i + 1}`,
        name: teamNames[i] || `Equipo ${i + 1}`,
        playerIds: slice
      });
    }

    return this.updateEvent(evt => ({
      ...evt,
      teams: {
        teams: newTeams
      }
    }));
  }

  /**
   * Reasigna un jugador a un equipo específico (o lo saca de todos los equipos si targetTeamId es null)
   */
  assignPlayerToTeam(playerId: string, targetTeamId: string | null) {
    if (!this.canEditTeams()) return Promise.resolve(false);
    return this.updateEvent(evt => {
      const currentTeams = evt.teams?.teams || [];
      const updatedTeams = currentTeams.map(team => {
        // Quitar al jugador de todos los equipos primero
        const filteredPlayerIds = team.playerIds.filter(id => id !== playerId);
        // Si es el equipo destino, agregarlo
        if (targetTeamId && team.id === targetTeamId) {
          filteredPlayerIds.push(playerId);
        }
        return {
          ...team,
          playerIds: filteredPlayerIds
        };
      });

      return {
        ...evt,
        teams: {
          teams: updatedTeams
        }
      };
    });
  }

  /**
   * Actualiza el rol / posición táctica de un jugador (ARQ, DEF, MED, DEL)
   */
  updatePlayerRole(playerId: string, newRole: 'ARQ' | 'DEF' | 'MED' | 'DEL') {
    if (!this.canEditTeams()) return Promise.resolve(false);
    return this.updateEvent(evt => ({ ...evt, playerRoles: { ...evt.playerRoles, [playerId]: newRole } }));
  }

  updateDinnerTitle(dinnerTitle: string) {
    if (!this.canEditDinner()) return Promise.resolve(false);
    return this.updateEvent(evt => ({
      ...evt,
      dinnerTitle
    }));
  }

  updateDinnerShopper(dinnerShopperPlayerId: string | undefined) {
    if (!this.canEditDinner()) return Promise.resolve(false);
    return this.updateEvent(evt => ({
      ...evt,
      dinnerShopperPlayerId
    }));
  }

  addMenuItem(name: string, amount: number, icon = '🍽️', buyerPlayerId?: string) {
    if (!this.canEditDinner()) return Promise.resolve(false);
    if (!name.trim() || !Number.isFinite(amount) || amount < 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.00001) return Promise.resolve(false);
    const newItem: MenuItem = {
      id: crypto.randomUUID(),
      name,
      amount,
      icon,
      buyerPlayerId
    };
    return this.updateEvent(evt => ({
      ...evt,
      menuItems: [...evt.menuItems, newItem]
    }));
  }

  updateItemBuyer(itemId: string, buyerPlayerId?: string) {
    if (!this.canEditDinner()) return Promise.resolve(false);
    return this.updateEvent(evt => ({
      ...evt,
      menuItems: evt.menuItems.map(item =>
        item.id === itemId ? { ...item, buyerPlayerId } : item
      )
    }));
  }

  removeMenuItem(id: string) {
    if (!this.canEditDinner()) return Promise.resolve(false);
    return this.updateEvent(evt => ({
      ...evt,
      menuItems: evt.menuItems.filter(item => item.id !== id)
    }));
  }

  async createNewEvent(data: Partial<SoccerEvent>): Promise<boolean> {
    if (!this.auth.isAdmin()) return false;
    if (!data.title?.trim() || !data.date || !data.time || !data.location?.trim() ||
        !Number.isFinite(data.pitchPrice) || data.pitchPrice! <= 0) {
      this.error.set('Completá la fecha, el lugar, el horario y un precio de cancha mayor a cero.');
      return false;
    }
    const { id, attendances, ...event } = {
      ...this.emptyEvent(), ...data, title: data.title.trim(), location: data.location.trim(),
      dinnerTitle: '', status: 'open' as const, attendances: {}, matchPlayedPlayerIds: [], matchPaidPlayerIds: [],
      menuItems: [], dinnerAttendedPlayerIds: [], dinnerPaidPlayerIds: [], teams: undefined
    };
    const eventId = crypto.randomUUID();
    return this.runSave(async () => {
      let result = await this.sb.from('event_records').insert({ id: eventId, data: event }).select('id, data, version').abortSignal(AbortSignal.timeout(15000)).single();
      if (result.error?.code === '23505') result = await this.sb.from('event_records').select('id, data, version').eq('id', eventId).abortSignal(AbortSignal.timeout(15000)).single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No se recibió confirmación.');
      this.payments.set([]);
      this.applyRecord(result.data, {});
      this.players.set([]);
      this.loading.set(false);
    });
  }
}
