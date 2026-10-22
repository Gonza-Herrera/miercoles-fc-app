import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface UserProfile { id: string; display_name: string; avatar_path: string | null; use_google_avatar: boolean; }
export function profileNameError(name: string): string | null {
  return name.trim().length < 2 || name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(name)
    ? 'Ingresá un nombre de entre 2 y 60 caracteres.' : null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private client = inject(SupabaseService).client;
  private activeId = '';
  private generation = 0;
  private revision = 0;
  private pendingLoad?: Promise<boolean>;
  private upload?: { file: File; path: string; complete: boolean };
  readonly profiles = signal<Record<string, UserProfile>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  activate(id: string) {
    if (id === this.activeId) return;
    this.activeId = id; this.generation++; this.pendingLoad = undefined;
    this.profiles.set({}); this.error.set(null); this.notice.set(null); this.upload = undefined;
  }
  load(): Promise<boolean> {
    if (!this.activeId) return Promise.resolve(false);
    if (this.pendingLoad) return this.pendingLoad;
    const generation = this.generation;
    const promise = this.fetch(generation).finally(() => { if (this.pendingLoad === promise) this.pendingLoad = undefined; });
    this.pendingLoad = promise;
    return promise;
  }
  private async fetch(generation: number): Promise<boolean> {
    const revision = this.revision;
    this.loading.set(true);
    try {
      const rows: UserProfile[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await this.client.from('user_profiles').select('*').order('id').range(offset, offset + 199).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        rows.push(...(data ?? [])); if ((data?.length ?? 0) < 200) break;
      }
      if (generation !== this.generation) return false;
      // A save wins over any earlier read.
      if (!this.saving() && revision === this.revision) this.profiles.set(Object.fromEntries(rows.map(p => [p.id, p])));
      if (!this.saving() && revision === this.revision) this.error.set(null);
      return true;
    } catch {
      if (generation === this.generation) this.error.set('No pudimos cargar los perfiles. Intentá nuevamente.');
      return false;
    } finally { if (generation === this.generation) this.loading.set(false); }
  }
  avatar(profile: UserProfile | undefined, googleAvatar = ''): string {
    if (!profile) return googleAvatar;
    return profile.avatar_path ? this.client.storage.from('profile-photos').getPublicUrl(profile.avatar_path).data.publicUrl
      : profile.use_google_avatar ? googleAvatar : '';
  }
  player<T extends { id: string; name: string; avatar: string }>(player: T): T {
    const profile = this.profiles()[player.id];
    return profile ? { ...player, name: profile.display_name, avatar: this.avatar(profile, player.avatar) || '/icons/avatar-placeholder.svg' } : player;
  }
  async save(name: string, photo: File | null, removePhoto: boolean): Promise<boolean> {
    if (this.saving() || !this.activeId) return false;
    const invalid = profileNameError(name);
    if (invalid) { this.error.set(invalid); return false; }
    if (photo && (photo.type !== 'image/jpeg' || photo.size > 524288)) { this.error.set('La foto debe ser JPG y pesar menos de 512 KB.'); return false; }
    const id = this.activeId, generation = this.generation;
    this.revision++;
    this.saving.set(true); this.error.set(null); this.notice.set(null);
    try {
      // Check identity before both the upload and the write; RLS is the final authority.
      const { data: identity, error: authError } = await this.client.auth.getUser();
      if (authError || identity.user?.id !== id || generation !== this.generation) throw new Error('La sesión cambió.');
      const previous = this.profiles()[id];
      let avatar_path = previous?.avatar_path ?? null;
      let use_google_avatar = previous?.use_google_avatar ?? true;
      if (removePhoto) { avatar_path = null; use_google_avatar = false; }
      if (photo) {
        if (this.upload?.file !== photo) this.upload = { file: photo, path: `${id}/${crypto.randomUUID()}.jpg`, complete: false };
        const upload = this.upload!;
        if (!upload.complete) {
          const { error } = await this.client.storage.from('profile-photos').upload(upload.path, photo, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
          // A retry after a lost upload response can find the same immutable file.
          if (error && !['409', 'Duplicate'].includes(String(error.statusCode)) && !/already exists/i.test(error.message)) throw error;
          upload.complete = true;
        }
        avatar_path = upload.path; use_google_avatar = false;
      }
      if (generation !== this.generation) throw new Error('La sesión cambió.');
      const profile: UserProfile = { id, display_name: name.trim(), avatar_path, use_google_avatar };
      const { data, error } = await this.client.from('user_profiles').upsert(profile, { onConflict: 'id' }).select('*').abortSignal(AbortSignal.timeout(15000)).single();
      if (error || !data) throw error ?? new Error('Sin confirmación.');
      if (generation !== this.generation) return false;
      this.profiles.update(rows => ({ ...rows, [id]: data as UserProfile }));
      this.upload = undefined; this.notice.set('Perfil guardado'); return true;
    } catch {
      if (generation === this.generation) this.error.set('No pudimos confirmar el guardado. Revisá la conexión y reintentá.');
      return false;
    } finally { this.saving.set(false); }
  }
}
