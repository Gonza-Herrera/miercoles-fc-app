import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container animate-fade-in">
      <!-- Hero Header with Stadium Lights Texture -->
      <div class="hero-section">
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <div class="hero-top">
            <span class="hero-badge">⚽ {{ state.hasEvent() ? 'Próxima Fecha' : 'Miércoles FC' }}</span>
            <!-- User avatar — opens profile sheet -->
            <button class="avatar-btn" (click)="openProfile()" [attr.aria-label]="'Perfil de ' + (auth.currentUser()?.name ?? 'usuario')">
              @if (auth.currentUser()?.avatarUrl) {
                <img class="avatar-img" [src]="auth.currentUser()!.avatarUrl" [alt]="auth.currentUser()!.name" />
              } @else {
                {{ userInitials() }}
              }
              @if (auth.isAdmin()) {
                <span class="admin-dot" title="Admin"></span>
              }
            </button>
          </div>
          
          @if (state.hasEvent()) {
          <h1 class="hero-title">{{ event().title }}</h1>
          <div class="hero-meta">
            <div class="meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>{{ event().location }}</span>
            </div>
            <span class="meta-dot">•</span>
            <div class="meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>{{ event().time }} hs</span>
            </div>
          </div>
          } @else {
            <h1 class="hero-title">Miércoles FC</h1>
          }
        </div>
      </div>

      @if (state.error()) {
        <div class="empty-event" role="alert">
          <p>{{ state.error() }}</p>
          <button class="btn btn-secondary" (click)="state.loadEvent()">Reintentar</button>
        </div>
      }
      @if (state.loading()) {
        <section class="empty-event" role="status"><p>Cargando evento…</p></section>
      } @else if (!state.hasEvent() && !state.error()) {
        <section class="empty-event">
          <span class="empty-event-icon" aria-hidden="true">⚽</span>
          <h2>Aún no hay eventos creados</h2>
          @if (auth.isAdmin()) {
            <p>Creá un evento con la fecha, el lugar, el horario y el precio de la cancha para abrir las confirmaciones.</p>
            <button class="btn btn-primary btn-block" routerLink="/admin/nuevo-evento">Crear un evento</button>
          } @else {
            <p>Cuando el administrador publique la próxima fecha, vas a poder confirmar tu presencia.</p>
          }
        </section>
      }
      @if (state.hasEvent()) {
      <!-- Quick Status Cards -->
      <div class="cards-grid">
        
        <!-- CARD PARTIDO -->
        <div class="event-card soccer-card">
          <div class="card-header">
            <div class="card-icon soccer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m4.93 4.93 4.24 4.24"></path>
                <path d="m14.83 9.17 4.24-4.24"></path>
                <path d="m14.83 14.83 4.24 4.24"></path>
                <path d="m9.17 14.83-4.24 4.24"></path>
                <circle cx="12" cy="12" r="4"></circle>
              </svg>
            </div>
            <div class="card-header-text">
              <h2>Partido</h2>
              <p class="confirmed-count">{{ state.soccerConfirmedCount() }} confirmados de {{ state.expectedSoccerPlayers }} posibles</p>
            </div>
          </div>

          <div class="card-pricing">
            <div class="price-row">
              <span class="price-label">Cancha</span>
              <span class="price-val">\${{ event().pitchPrice | number }}</span>
            </div>
            <div class="price-row sub-row">
              <span class="price-label">Estimado para 10 jugadores</span>
              <span class="price-val highlight">\${{ state.estimatedSoccerCostPerPlayer() | number }} c/u</span>
            </div>
          </div>

          @if (event().status === 'open') {
          <button class="btn btn-primary btn-block" (click)="goToAttendance()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m12 7 4.8 3.5-1.8 5.6H9l-1.8-5.6L12 7Z"></path>
              <path d="M12 7V2m4.8 8.5 4.7-1.6M15 16.1l3 3.9m-9-3.9-3 3.9m1.2-9.5L2.5 8.9"></path>
            </svg>
            {{ (myAttendance() && myAttendance().playsSoccer) ? 'Modificar: Voy a jugar' : 'Voy a jugar' }}
          </button>
          } @else { <p>Inscripciones cerradas</p> }
        </div>

        <!-- CARD CENA -->
        <div class="event-card dinner-card">
          <div class="card-header">
            <div class="card-icon dinner-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 2v8a4 4 0 0 1-4 4H8"></path>
                <path d="M6 2v20"></path>
                <path d="M10 2v6"></path>
                <path d="M14 2v6"></path>
              </svg>
            </div>
            <div class="card-header-text">
              <h2>Cena</h2>
              <p class="confirmed-count">{{ state.dinnerConfirmedCount() }} confirmados</p>
            </div>
          </div>

          <div class="card-pricing">
            <div class="price-row">
              <span class="price-label">{{ event().dinnerTitle || 'Menú por definir' }}</span>
            </div>
            <div class="price-row sub-row">
              <span class="price-label">{{ event().dinnerAttendedPlayerIds.length ? 'Costo por persona' : 'Estimado por persona' }}</span>
              @if (event().menuItems.length && state.dinnerPreviewAttendeeCount()) {
                <span class="price-val highlight dinner-val">\${{ state.dinnerPreviewCostPerPerson() | number }} c/u</span>
              } @else if (event().menuItems.length) {
                <span class="price-val highlight dinner-val">Faltan asistentes</span>
              } @else {
                <span class="price-val highlight dinner-val">A definir en Cena</span>
              }
            </div>
          </div>

          @if (event().status === 'open') {
          <button class="btn btn-dinner btn-block" (click)="goToAttendance()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
              <path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 3c-3 0-5 3-5 6v4h5M20 3v18" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            {{ (myAttendance() && myAttendance().attendsDinner) ? 'Modificar: Voy a comer' : 'Voy a comer' }}
          </button>
          } @else { <p>Inscripciones cerradas</p> }
        </div>

        <!-- ACCIONES RÁPIDAS DE GESTIÓN -->
        <div class="quick-admin-box">
          <div class="quick-title">Gestión del Miércoles</div>
          @if (auth.isAdmin() && !state.dinnerClosed()) {
            <button class="btn btn-secondary" style="margin-bottom: 12px; width: 100%" routerLink="/admin/editar-evento">Editar evento</button>
          }
          <div class="quick-grid">
            <button class="quick-btn" [routerLink]="['/partido/resultados', event().id]">
              <span class="q-icon">🏆</span>
              <span>Resultados</span>
            </button>
            <button class="quick-btn" routerLink="/partido/confirmados">
              <span class="q-icon">👥</span>
              <span>Confirmados</span>
            </button>
            @if ((auth.isAdmin() && event().status === 'open') || event().captainDraft) {
              <button class="quick-btn" routerLink="/partido/capitanes"><span class="q-icon">🧢</span><span>DT / Capitanes</span></button>
            }
            @if (auth.isAdmin()) {
            @if (state.canEditTeams()) {
            <button class="quick-btn" routerLink="/partido/armar-equipos">
              <span class="q-icon">👕</span>
              <span>Armar Equipos</span>
            </button>
            }
            <button class="quick-btn" routerLink="/partido/presentes">
              <span class="q-icon">📋</span>
              <span>Presentes</span>
            </button>
            } @else if (state.currentEvent().teams?.teams?.length) {
              <button class="quick-btn" routerLink="/partido/equipos">
                <span class="q-icon">👕</span>
                <span>Ver equipos</span>
              </button>
            }
            <button class="quick-btn" routerLink="/cena/menu">
              <span class="q-icon">🥩</span>
              <span>Menú Cena</span>
            </button>
          </div>
        </div>

      </div>
      }
      <div class="statistics-entry">
        <a class="btn btn-secondary" routerLink="/estadisticas">📊 Ver estadísticas</a>
      </div>
    </div>

    <!-- ── Profile bottom sheet ──────────────────────────────────────── -->
    @if (profileOpen()) {
      <div class="sheet-backdrop" (click)="closeProfile()"></div>
      <div class="profile-sheet animate-slide-up">
        <div class="sheet-handle"></div>

        <!-- User info -->
        <div class="sheet-user-row">
          <div class="sheet-avatar">
            @if (auth.currentUser()?.avatarUrl) {
              <img [src]="auth.currentUser()!.avatarUrl" [alt]="auth.currentUser()!.name" />
            } @else {
              {{ userInitials() }}
            }
          </div>
          <div class="sheet-user-info">
            <p class="sheet-name">{{ auth.currentUser()?.name ?? 'Usuario' }}</p>
            <p class="sheet-email">{{ auth.currentUser()?.email }}</p>
            @if (auth.isAdmin()) {
              <span class="sheet-admin-badge">⚙️ Admin</span>
            }
          </div>
        </div>

        <div class="sheet-divider"></div>

        <!-- Actions -->
        @if (auth.isAdmin()) {
          <button class="sheet-action sheet-action-primary" routerLink="/admin/nuevo-evento" (click)="closeProfile()">📅 Crear evento</button>
        }
        @if (auth.isAdmin()) { <button class="sheet-action sheet-action-primary" routerLink="/admin/acceso" (click)="closeProfile()">🔐 Administrar acceso</button> }
        <button class="sheet-action sheet-action-primary" routerLink="/mi-perfil" (click)="closeProfile()">👤 Mi perfil</button>
        <button class="sheet-action sheet-action-primary" routerLink="/notificaciones" (click)="closeProfile()">🔔 Notificaciones</button>
        @if (auth.isAdmin() && state.hasEvent() && !state.dinnerClosed()) {
          <button class="sheet-action sheet-action-primary" routerLink="/admin/editar-evento" (click)="closeProfile()">Editar evento</button>
        }
        <button class="sheet-action" id="btn-sign-out" (click)="signOut()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Cerrar sesión
        </button>
      </div>
    }
  `,
  styles: [`
    .statistics-entry { padding: 16px 18px 100px; }
    .statistics-entry a { width: 100%; text-decoration: none; }
    .empty-event {
      margin: 24px 18px;
      padding: 32px 22px;
      border-radius: 20px;
      background: white;
      border: 1px solid var(--border-color);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .empty-event-icon { font-size: 3rem; }
    .empty-event h2 { font-size: 1.3rem; color: var(--text-main); }
    .empty-event p { color: var(--text-muted); line-height: 1.6; }

    .home-container {
      padding-bottom: 90px;
    }

    /* ── Avatar button ── */
    .avatar-btn {
      position: relative;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      border: 2px solid rgba(255,255,255,0.5);
      color: white;
      font-weight: 800;
      font-size: 0.8rem;
      font-family: 'Plus Jakarta Sans', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: visible;
      padding: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .avatar-btn:active {
      transform: scale(0.93);
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    .admin-dot {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 10px;
      height: 10px;
      background: #10B981;
      border: 2px solid white;
      border-radius: 50%;
    }

    /* ── Profile bottom sheet ── */
    .sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(4px);
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }

    .profile-sheet {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      background: white;
      border-radius: 24px 24px 0 0;
      padding: 12px 24px 40px;
      z-index: 101;
      box-shadow: 0 -8px 30px rgba(0,0,0,0.15);
    }

    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(100%); }
      to   { transform: translateX(-50%) translateY(0); }
    }

    .animate-slide-up {
      animation: slideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      background: #E2E8F0;
      border-radius: 99px;
      margin: 0 auto 20px;
    }

    .sheet-user-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }

    .sheet-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      color: white;
      font-weight: 800;
      font-size: 1.1rem;
      font-family: 'Outfit', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }

    .sheet-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .sheet-name {
      font-size: 1rem;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.2;
    }

    .sheet-email {
      font-size: 0.8rem;
      color: #64748B;
      margin-top: 2px;
    }

    .sheet-admin-badge {
      display: inline-block;
      margin-top: 5px;
      background: #ECFDF5;
      color: #059669;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 99px;
    }

    .sheet-divider {
      height: 1px;
      background: #F1F5F9;
      margin-bottom: 8px;
    }

    .sheet-action {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 4px;
      background: none;
      border: none;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: #EF4444;
      cursor: pointer;
      border-radius: 12px;
      transition: background 0.15s ease;
    }

    .sheet-action:hover {
      background: #FFF1F2;
    }

    .sheet-action-primary {
      color: var(--primary);
    }

    .sheet-action-primary:hover {
      background: var(--primary-light);
    }

    .sheet-action svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .hero-section {
      position: relative;
      background: linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%);
      color: white;
      padding: 24px 20px 42px;
      border-bottom-left-radius: 28px;
      border-bottom-right-radius: 28px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(67, 56, 202, 0.4);
    }

    .hero-overlay {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
      background-size: 16px 16px;
      opacity: 0.6;
    }

    .hero-content {
      position: relative;
      z-index: 2;
    }

    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .hero-badge {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      padding: 4px 12px;
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .hero-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }

    .hero-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      color: #E0E7FF;
      font-weight: 500;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .meta-item svg {
      width: 15px;
      height: 15px;
      opacity: 0.85;
    }

    .meta-dot {
      opacity: 0.5;
    }

    /* Cards */
    .cards-grid {
      padding: 0 18px;
      margin-top: -20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
      z-index: 5;
    }

    .event-card {
      background: white;
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--border-color);
      transition: transform 0.2s ease;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }

    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .soccer-icon {
      background: #EEF2FF;
      color: var(--primary);
    }

    .dinner-icon {
      background: #FFF7ED;
      color: #EA580C;
    }

    .card-icon svg {
      width: 22px;
      height: 22px;
    }

    .card-header-text h2 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.2;
    }

    .confirmed-count {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .card-pricing {
      background: var(--bg-app);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }

    .sub-row {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed var(--border-color);
    }

    .price-label {
      color: var(--text-muted);
    }

    .price-val {
      font-weight: 700;
      color: var(--text-main);
    }

    .price-val.highlight {
      color: var(--primary);
      font-size: 1rem;
    }

    .price-val.dinner-val {
      color: #EA580C;
    }

    .btn-block {
      width: 100%;
    }

    .quick-admin-box {
      background: white;
      border-radius: 18px;
      padding: 16px;
      border: 1px solid var(--border-color);
    }

    .quick-title {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .quick-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .quick-btn {
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 10px 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-main);
      transition: all 0.15s ease;
    }

    .quick-btn:hover {
      background: var(--primary-light);
      border-color: var(--primary);
      color: var(--primary);
    }

    .q-icon {
      font-size: 1.2rem;
    }
  `]
})
export class HomeComponent {
  state  = inject(EventStateService);
  auth   = inject(AuthService);
  private router = inject(Router);

  event = this.state.currentEvent;
  profileOpen = signal(false);

  /** 1-2 letter initials from the user's name */
  userInitials = () => {
    const name = this.auth.currentUser()?.name ?? 'U';
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? '')
      .join('');
  };

  myAttendance = () => {
    const myId = this.state.currentUser().id;
    return this.event().attendances[myId];
  };

  goToAttendance() { this.router.navigate(['/asistencia']); }

  openProfile()  { this.profileOpen.set(true); }
  closeProfile() { this.profileOpen.set(false); }

  async signOut() {
    this.profileOpen.set(false);
    await this.auth.signOut();
  }
}
