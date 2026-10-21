import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-dinner-attendees',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container animate-fade-in">
      <!-- Top Bar -->
      <header class="header-bar">
        <button class="icon-back-btn" (click)="goBack()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <span class="header-title">Cena</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <!-- Subheader Tabs -->
        <div class="dinner-tabs">
          <button 
            type="button" 
            class="tab-btn" 
            routerLink="/cena/menu">
            Menú
          </button>
          <button 
            type="button" 
            class="tab-btn active" 
            routerLink="/cena/asistentes">
            Asistentes ({{ state.currentEvent().dinnerAttendedPlayerIds.length }})
          </button>
        </div>

        <div class="page-headline">
          <h2>Asistentes a la cena</h2>
          <p class="subtitle">{{ auth.isAdmin() ? 'Marcá quiénes están comiendo para dividir los gastos' : 'Consultá quiénes asisten a la cena' }}</p>
        </div>

        <!-- Attendees selection list -->
        <div class="attendees-list">
          @for (player of allPlayers(); track player.id) {
            <div 
              class="attendee-row"
              [class.checked]="isAttending(player.id)"
              [style.cursor]="auth.isAdmin() && state.currentEvent().status === 'dinner' ? 'pointer' : 'default'"
              (click)="toggle(player.id)">
              <div class="player-left">
                <img [src]="player.avatar" [alt]="player.name" class="avatar-img" />
                <span class="player-name">{{ player.name }}</span>
              </div>

              <div class="checkbox-box" [class.active]="isAttending(player.id)">
                @if (isAttending(player.id)) {
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Action Button -->
      @if (auth.isAdmin() && !state.dinnerClosed()) {
      <div class="sticky-footer-action">
        <p>{{ state.currentEvent().status === 'dinner' ? 'Al confirmar, los asistentes y los gastos quedarán cerrados.' : 'Primero confirmá quienes jugaron para abrir el cierre de la cena.' }}</p>
        <button class="btn btn-primary btn-block" [disabled]="state.saving() || !selectedIds().length || state.currentEvent().status !== 'dinner'" (click)="saveAndContinue()">
          Guardar asistentes
        </button>
      </div>
      }
    </div>
  `,
  styles: [`
    .page-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--bg-app);
    }

    .icon-back-btn {
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: var(--text-main);
    }

    .header-title {
      font-weight: 700;
      font-size: 1rem;
    }

    .content-scroll {
      flex: 1;
      padding: 20px 18px 120px;
    }

    .dinner-tabs {
      display: flex;
      background: #E2E8F0;
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 20px;
      gap: 4px;
    }

    .tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 10px;
      border-radius: 9px;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .tab-btn.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
    }

    .page-headline h2 {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-top: 4px;
      margin-bottom: 20px;
    }

    .attendees-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .attendee-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: white;
      padding: 12px 16px;
      border-radius: 16px;
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .attendee-row.checked {
      border-color: #C7D2FE;
      background: #F8FAFC;
    }

    .player-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .avatar-img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
    }

    .player-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
    }

    .checkbox-box {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      border: 2px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      transition: all 0.2s ease;
    }

    .checkbox-box.active {
      background: var(--primary);
      border-color: var(--primary);
    }

    .btn-block {
      width: 100%;
      padding: 16px;
      font-size: 1rem;
    }
  `]
})
export class DinnerAttendeesComponent {
  auth = inject(AuthService);
  state = inject(EventStateService);
  private router = inject(Router);
  selectedIds = signal<string[]>([...this.state.currentEvent().dinnerAttendedPlayerIds]);

  allPlayers = this.state.players;

  isAttending(playerId: string) {
    return (this.state.dinnerClosed() || !this.auth.isAdmin() ? this.state.currentEvent().dinnerAttendedPlayerIds : this.selectedIds()).includes(playerId);
  }

  toggle(playerId: string) {
    if (!this.auth.isAdmin()) return;
    if (this.state.currentEvent().status !== 'dinner' || this.state.saving()) return;
    this.selectedIds.update(ids => ids.includes(playerId) ? ids.filter(id => id !== playerId) : [...ids, playerId]);
  }

  goBack() {
    this.router.navigate(['/cena/menu']);
  }

  async saveAndContinue() {
    if (!this.auth.isAdmin()) return;
    if (await this.state.confirmDinner(this.selectedIds())) this.router.navigate(['/cena/resumen']);
  }
}
