import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { EventStateService } from './services/event-state.service';
import { filter } from 'rxjs/operators';

/** Routes where the bottom navigation should NOT be shown */
const HIDDEN_NAV_ROUTES = ['/login', '/auth/callback', '/acceso-restringido'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- Mobile-first centered viewport -->
    <main class="app-viewport" [class.has-bottom-nav]="showBottomNav()">
      
      <!-- Dynamic Content from Router -->
      <router-outlet></router-outlet>
      @if (showBottomNav() && state.saving()) {
        <div class="save-overlay" role="status" aria-live="polite">Guardando cambios…</div>
      }
      @if (showBottomNav() && feedbackVisible() && state.error()) {
        <div class="save-feedback save-error" role="alert">
          <p>{{ state.error() }}</p>
          @if (state.canRetry()) {
            <button (click)="state.retryLastSave()" [disabled]="state.saving()">Reintentar guardado</button>
          }
          <button (click)="state.refreshAfterError()" [disabled]="state.saving()">Actualizar datos</button>
        </div>
      } @else if (showBottomNav() && feedbackVisible() && state.notice()) {
        <div class="save-feedback" role="status">
          <span>{{ state.notice() }}</span>
        </div>
      }

      <!-- Bottom Navigation — hidden on auth screens -->
      @if (showBottomNav()) {
        <nav class="bottom-nav">
          <!-- Tab 1: Inicio -->
          <a 
            routerLink="/" 
            routerLinkActive="active" 
            [routerLinkActiveOptions]="{ exact: true }" 
            class="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Inicio</span>
          </a>

          <!-- Tab 2: Partido -->
          <a 
            routerLink="/partido/confirmados" 
            routerLinkActive="active" 
            class="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m4.93 4.93 4.24 4.24"></path>
              <path d="m14.83 9.17 4.24-4.24"></path>
              <path d="m14.83 14.83 4.24 4.24"></path>
              <path d="m9.17 14.83-4.24 4.24"></path>
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
            <span>Partido</span>
          </a>

          <!-- Tab 3: Cena -->
          <a 
            routerLink="/cena/menu" 
            routerLinkActive="active" 
            class="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 2v8a4 4 0 0 1-4 4H8"></path>
              <path d="M6 2v20"></path>
              <path d="M10 2v6"></path>
              <path d="M14 2v6"></path>
            </svg>
            <span>Cena</span>
          </a>

          <!-- Tab 4: Pagos -->
          <a 
            routerLink="/pagos/resumen-total" 
            routerLinkActive="active" 
            class="nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="20" height="14" x="2" y="5" rx="2"></rect>
              <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>
            <span>Pagos</span>
          </a>
        </nav>
      }

    </main>
  `,
  styles: [`
    .save-overlay { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; background: rgba(255,255,255,.8); color: var(--primary); font-weight: 700; }
    .save-feedback { position: fixed; bottom: calc(var(--bottom-nav-height) + 12px); left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 448px; padding: 14px; border: 1px solid #A7F3D0; border-radius: 12px; background: #ECFDF5; color: #065F46; z-index: 1999; box-shadow: 0 4px 20px #0002; }
    .save-feedback button { padding: 8px; border: none; border-radius: 8px; margin: 4px; cursor: pointer; }
    .save-error { background: #FFF1F2; color: #9F1239; border-color: #FECDD3; }

    :host {
      display: flex;
      justify-content: center;
      width: 100%;
      min-height: 100vh;
    }
  `]
})
export class App {
  state = inject(EventStateService);
  title = 'Miércoles FC';

  private router = inject(Router);

  /** True when the bottom nav should be visible */
  showBottomNav = signal(true);
  readonly feedbackVisible = signal(false);

  constructor() {
    effect(onCleanup => {
      const error = this.state.error();
      const notice = this.state.notice();
      const saving = this.state.saving();
      this.feedbackVisible.set(!saving && !!(error || notice));
      if (!saving && (error || notice)) {
        const timer = setTimeout(() => this.feedbackVisible.set(false), 3000);
        onCleanup(() => clearTimeout(timer));
      }
    });

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        const url = e.urlAfterRedirects.split('?')[0];
        this.showBottomNav.set(!HIDDEN_NAV_ROUTES.includes(url));
      });
  }
}

export { App as AppComponent };
