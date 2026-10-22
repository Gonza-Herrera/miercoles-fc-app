import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
export type AccessStatus = 'checking' | 'allowed' | 'denied' | 'error';
@Injectable({ providedIn: 'root' })
export class GroupAccessService {
  private client = inject(SupabaseService).client;
  private userId = '';
  private generation = 0;
  private pending?: Promise<boolean>;
  readonly status = signal<AccessStatus>('denied');
  constructor() {
    const refresh = () => { if (this.userId) void this.check(); };
    const timer = setInterval(refresh,15000); window.addEventListener('focus',refresh);
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); window.removeEventListener('focus',refresh); });
  }
  activate(id: string) {
    if (id === this.userId) return;
    this.userId=id; this.generation++; this.pending=undefined; this.status.set(id ? 'checking' : 'denied');
  }
  check(): Promise<boolean> {
    if (!this.userId) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const generation=this.generation;
    const pending=this.fetch(generation).finally(() => { if(this.pending===pending) this.pending=undefined; });
    this.pending=pending; return pending;
  }
  private async fetch(generation: number): Promise<boolean> {
    try {
      const {data,error}=await this.client.rpc('my_group_access').abortSignal(AbortSignal.timeout(15000));
      if(generation!==this.generation) return false;
      if(error || typeof data?.allowed!=='boolean') throw error ?? new Error('Sin confirmación');
      this.status.set(data.allowed ? 'allowed' : 'denied'); return data.allowed;
    } catch { if(generation===this.generation) this.status.set('error'); return false; }
  }
}
