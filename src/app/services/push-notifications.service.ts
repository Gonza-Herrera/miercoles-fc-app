import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PushJob {
  id: string; title: string; body: string; path: string; created_at: string;
  total: number; accepted: number; failed: number; expired: number; uncertain: number; remaining: number;
  status: 'queued' | 'sending' | 'finished';
}

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private client = inject(SupabaseService).client;
  private generation = 0;
  readonly supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  readonly iosNeedsInstall = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
  readonly active = signal(false);
  readonly busy = signal(false);
  readonly sending = signal(false);
  readonly loading = signal(false);
  readonly publicKey = signal<string | null>(null);
  readonly devices = signal<number | null>(null);
  readonly history = signal<PushJob[]>([]);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pendingJob = signal<Pick<PushJob, 'id' | 'title' | 'body' | 'path'> | null>(null);
  readonly permission = signal<NotificationPermission | 'unsupported'>(this.supported ? Notification.permission : 'unsupported');
  private registration = 'serviceWorker' in navigator && window.isSecureContext
    ? navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => null) : Promise.resolve(null);

  constructor() {
    this.client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        this.generation++;
        this.active.set(false); this.history.set([]); this.pendingJob.set(null);
        this.loading.set(false); this.busy.set(false); this.sending.set(false);
        this.devices.set(null); this.publicKey.set(null); this.error.set(null); this.notice.set(null);
        void this.registration.then(async registration => {
          await (await registration?.pushManager.getSubscription())?.unsubscribe();
          for (const notification of await registration?.getNotifications?.() ?? []) notification.close();
        }).catch(() => undefined);
      }
    });
  }

  private async request(body: object, timeout = 15000) {
    const { data, error } = await this.client.functions.invoke('push-notifications', { body, timeout });
    if (error) {
      let message = 'No pudimos conectar con el servicio de notificaciones. Intentá nuevamente.';
      try { const response = await (error as any).context?.json(); if (response?.error) message = response.error; } catch { /* Network failure. */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async load(admin: boolean) {
    if (this.loading() || this.sending()) return;
    const generation = this.generation;
    this.loading.set(true); this.error.set(null);
    try {
      const config = await this.request({ action: 'config' });
      if (generation !== this.generation) return;
      this.publicKey.set(config.publicKey); this.devices.set(config.devices);
      if (this.supported) {
        this.permission.set(Notification.permission);
        const registration = await this.registration;
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const own = await this.client.from('push_subscriptions').select('id').eq('endpoint', subscription.endpoint).maybeSingle();
          if (own.error) throw own.error;
          if (generation !== this.generation) return;
          this.active.set(!!own.data && Notification.permission === 'granted');
        } else this.active.set(false);
      }
      if (admin) await this.loadHistory();
    } catch (error: any) { if (generation === this.generation) this.error.set(error.message || 'No pudimos consultar las notificaciones.'); }
    finally { if (generation === this.generation) this.loading.set(false); }
  }

  async enable() {
    if (this.busy() || !this.supported || this.iosNeedsInstall || !this.publicKey()) return;
    this.busy.set(true); this.error.set(null); this.notice.set(null);
    const generation = this.generation;
    // Must be called directly from the click, before awaiting anything (required by iOS).
    const permission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    try {
      const granted = await permission; this.permission.set(granted);
      if (generation !== this.generation) return;
      if (granted !== 'granted') throw new Error('No se activaron las notificaciones. Podés habilitarlas desde los ajustes del dispositivo.');
      if (!await this.registration) throw new Error('No pudimos preparar las notificaciones. Actualizá la app y reintentá.');
      let workerTimeout: ReturnType<typeof setTimeout> | undefined;
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => { workerTimeout = setTimeout(() => reject(new Error('El dispositivo no pudo iniciar las notificaciones. Cerrá y volvé a abrir la app.')), 10000); })
      ]).finally(() => clearTimeout(workerTimeout));
      const key = this.publicKey()!;
      const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), char => char.charCodeAt(0));
      let subscription = await registration.pushManager.getSubscription();
      if (subscription?.options.applicationServerKey) {
        const current = new Uint8Array(subscription.options.applicationServerKey);
        if (current.length !== bytes.length || current.some((value, index) => value !== bytes[index])) {
          await subscription.unsubscribe(); subscription = null;
        }
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes.buffer });
      if (generation !== this.generation) { await subscription.unsubscribe(); return; }
      await this.request({ action: 'subscribe', subscription: subscription.toJSON() });
      if (generation !== this.generation) { await subscription.unsubscribe(); return; }
      this.active.set(true); this.notice.set('Notificaciones activadas en este dispositivo');
    } catch (error: any) { if (generation === this.generation) this.error.set(error.message || 'No pudimos activar las notificaciones.'); }
    finally { if (generation === this.generation) this.busy.set(false); }
  }

  async detachForSignOut() {
    const registration = await this.registration;
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) { this.active.set(false); return; }
    let local = false, remote = false;
    try { local = await subscription.unsubscribe(); } catch { /* Try server-side removal too. */ }
    try { await this.request({ action: 'unsubscribe', endpoint: subscription.endpoint }, 6000); remote = true; } catch { /* Expired endpoints are also pruned by the sender. */ }
    if (!local && !remote) throw new Error('No pudimos desactivar este dispositivo. Revisá la conexión y reintentá.');
    this.active.set(false);
    try {
      for (const notification of await registration?.getNotifications?.() ?? []) notification.close();
    } catch { /* Subscription removal already succeeded; closing visible notices is best effort. */ }
  }

  async disable() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null); this.notice.set(null);
    try { await this.detachForSignOut(); this.notice.set('Notificaciones desactivadas en este dispositivo'); }
    catch (error: any) { this.error.set(error.message); }
    finally { this.busy.set(false); }
  }

  async loadHistory() {
    const generation = this.generation;
    const { data, error } = await this.client.from('push_jobs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    if (generation === this.generation) this.history.set(data as PushJob[]);
  }

  async send(input: Pick<PushJob, 'title' | 'body' | 'path'>, existingId?: string) {
    if (this.sending()) return false;
    if (this.pendingJob() && !existingId) return false;
    if (this.pendingJob() && this.pendingJob()!.id !== existingId) return false;
    const job = { ...input, id: existingId ?? crypto.randomUUID() };
    const generation = this.generation;
    this.pendingJob.set(job); this.sending.set(true); this.error.set(null); this.notice.set(null);
    try {
      // Continue bounded batches automatically; the same job ID never resends completed deliveries.
      let lastRemaining = Infinity;
      for (let batch = 0; batch < 100; batch++) {
        const response = await this.request({ action: 'send', ...job }, 45000);
        if (generation !== this.generation) return false;
        const saved = response.job as PushJob;
        this.history.update(jobs => [saved, ...jobs.filter(item => item.id !== saved.id)].slice(0, 20));
        if (saved.status === 'finished') {
          this.pendingJob.set(null);
          this.notice.set(saved.total ? `Envío procesado: ${saved.accepted} aceptadas por el servicio push.` : 'Todavía no hay dispositivos con notificaciones activadas.');
          return true;
        }
        // Another request may still be processing. Avoid polling or retrying claimed deliveries in a loop.
        if (saved.remaining >= lastRemaining) break;
        lastRemaining = saved.remaining;
      }
      this.notice.set('El envío tiene entregas pendientes. Podés continuarlo desde el historial.');
      return false;
    } catch (error: any) {
      if (generation === this.generation) this.error.set(error.message || 'No pudimos confirmar el envío. Reintentá el mismo envío.');
      return false;
    } finally { if (generation === this.generation) this.sending.set(false); }
  }

  retry() { const job = this.pendingJob(); return job ? this.send(job, job.id) : Promise.resolve(false); }
}
