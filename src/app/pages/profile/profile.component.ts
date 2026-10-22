import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProfileService } from '../../services/profile.service';
import { EventStateService } from '../../services/event-state.service';

@Component({
  standalone: true, selector: 'app-profile', imports: [FormsModule, RouterLink],
  template: `
    <div class="profile-page">
      <header class="header-bar"><a routerLink="/" aria-label="Volver al inicio" class="back">‹</a><strong>Mi perfil</strong><span aria-hidden="true">👤</span></header>
      <main>
        <h1>Cómo te ve el grupo</h1>
        <p>Usá tu nombre o apodo habitual para que tus amigos puedan reconocerte.</p>
        @if (loading()) { <p role="status">Cargando perfil…</p> }
        @else if (!ready()) { <p role="alert">No pudimos cargar tu perfil.</p><button class="btn btn-secondary" (click)="load()">Reintentar</button> }
        @else {
          <form class="card" (ngSubmit)="save()">
            <fieldset [disabled]="profiles.saving() || processing()">
              <div class="avatar">@if (preview()) { <img [src]="preview()" alt="Vista previa de tu foto" /> } @else { <span>{{ initials() }}</span> }</div>
              <label for="profile-photo">Foto de perfil</label>
              <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" (change)="selectPhoto($event)" />
              <small>Elegí una foto de tu dispositivo (hasta 10 MB). Se ajustará al tamaño del perfil.</small>
              @if (preview()) { <button type="button" class="btn btn-secondary" (click)="remove()">Quitar foto</button> }
              <label for="profile-name">Nombre visible para el grupo</label>
              <input id="profile-name" type="text" name="displayName" autocomplete="nickname" maxlength="60" minlength="2" required [(ngModel)]="name" placeholder="Por ejemplo: Gonzalo Herrera o Gonza" />
              <label for="profile-email">Cuenta de acceso</label><input id="profile-email" type="email" [value]="auth.currentUser()?.email || ''" readonly />
              <small>El nombre y la foto se usan en Miércoles FC. Tu cuenta de Google sigue siendo la misma.</small>
              <button type="submit" class="btn btn-primary full">Guardar perfil</button>
            </fieldset>
            @if (profiles.saving() || processing()) { <p role="status">{{ processing() ? 'Preparando foto…' : 'Guardando perfil…' }}</p> }
            @if (photoError()) { <p class="error" role="alert">{{ photoError() }}</p> }
          </form>
        }
      </main>
      @if (feedbackVisible()) { <div class="feedback" [class.error-feedback]="!!profiles.error()" role="status">{{ profiles.error() || profiles.notice() }}</div> }
    </div>
  `,
  styles: [`
    :host{display:block}.profile-page{min-height:100vh;background:var(--bg-app)}main{padding:22px 18px calc(var(--bottom-nav-height) + 24px)}
    .back{font-size:2rem;text-decoration:none;color:var(--text-main)}h1{font-size:1.4rem}p,small{line-height:1.5;color:var(--text-muted)}p{margin:12px 0}small{display:block;font-size:.78rem;margin:10px 0 16px}
    .card{padding:20px;background:white;border:1px solid var(--border-color);border-radius:20px;margin-top:20px}fieldset{border:0;min-width:0;padding:0}.avatar{width:104px;height:104px;border-radius:50%;overflow:hidden;background:var(--primary-light);color:var(--primary);display:grid;place-items:center;margin:0 auto 20px;font-weight:800;font-size:2rem}.avatar img{width:100%;height:100%;object-fit:cover}
    label{display:block;font-size:.85rem;font-weight:700;margin:20px 0 8px}input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:10px;background:white;color:var(--text-main);padding:12px;font:inherit;font-size:16px}input[readonly]{background:var(--bg-app);color:var(--text-muted)}.full{width:100%;min-height:44px;margin-top:12px}button:disabled{opacity:.5}.error{color:#9f1239}
    .feedback{position:fixed;bottom:calc(var(--bottom-nav-height) + 12px);left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:448px;padding:14px;z-index:1999;border-radius:12px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.error-feedback{background:#fff1f2;color:#9f1239;border-color:#fecdd3}
  `]
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly profiles = inject(ProfileService);
  private state = inject(EventStateService);
  readonly loading = signal(true); readonly ready = signal(false);
  readonly processing = signal(false); readonly preview = signal(''); readonly photoError = signal('');
  readonly feedbackVisible = signal(false);
  name = ''; private photo: File | null = null; private removePhoto = false; private previewUrl = ''; private destroyed = false;
  constructor() {
    void this.load();
    effect(cleanup => {
      const message = this.profiles.error() || this.profiles.notice(); this.feedbackVisible.set(!!message);
      if (message) { const timer = setTimeout(() => this.feedbackVisible.set(false), 3000); cleanup(() => clearTimeout(timer)); }
    });
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; if (this.previewUrl) URL.revokeObjectURL(this.previewUrl); });
  }
  async load() {
    this.loading.set(true);
    const ok = await this.profiles.load();
    if (this.destroyed) return;
    this.ready.set(ok); this.loading.set(false);
    if (ok) { this.name = this.auth.currentUser()?.name ?? ''; this.preview.set(this.auth.currentUser()?.avatarUrl ?? ''); }
  }
  initials() { return this.name.trim().split(/\s+/).slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase(); }
  remove() {
    this.photo = null; this.removePhoto = true; this.preview.set(''); this.photoError.set('');
    if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; }
  }
  async selectPhoto(event: Event) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file || this.processing() || this.profiles.saving()) return;
    this.photoError.set('');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size > 10 * 1024 * 1024) { this.photoError.set('Elegí una foto JPG, PNG, WebP o HEIC de hasta 10 MB.'); return; }
    this.processing.set(true);
    const source = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = source; await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('Imagen demasiado grande');
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Sin canvas');
      context.fillStyle = '#fff'; context.fillRect(0,0,512,512);
      const side = Math.min(image.naturalWidth,image.naturalHeight);
      context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,512,512);
      const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Sin imagen')),'image/jpeg',.85));
      if (this.destroyed) return;
      this.photo = new File([blob],'perfil.jpg',{type:'image/jpeg'}); this.removePhoto = false;
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = URL.createObjectURL(blob); this.preview.set(this.previewUrl);
    } catch { if (!this.destroyed) this.photoError.set('No pudimos abrir esa foto. Probá con una imagen JPG o PNG.'); }
    finally { URL.revokeObjectURL(source); if (!this.destroyed) this.processing.set(false); }
  }
  async save() {
    if (!this.ready() || this.processing()) return;
    if (await this.profiles.save(this.name, this.photo, this.removePhoto)) {
      this.photo = null; this.removePhoto = false;
      this.preview.set(this.auth.currentUser()?.avatarUrl ?? '');
      if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; }
      await this.state.loadEvent();
    }
  }
}
