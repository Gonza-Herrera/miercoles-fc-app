import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-match-attendance-check',
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
        <span class="header-title">Marcar presentes</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <div class="page-headline">
          <h2>¿Quiénes jugaron?</h2>
          <p class="subtitle">Seleccioná los jugadores que asistieron al partido</p>
        </div>

        <div class="player-selection-list">
          @for (player of confirmedSoccerPlayers(); track player.id) {
            <div 
              class="player-select-row"
              [class.checked]="isPlayed(player.id)"
              (click)="toggle(player.id)">
              <div class="player-left">
                <img [src]="player.avatar" [alt]="player.name" class="avatar-img" />
                <span class="player-name">{{ player.name }}</span>
              </div>

              <div class="checkbox-box" [class.active]="isPlayed(player.id)">
                @if (isPlayed(player.id)) {
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
      <div class="sticky-footer-action">
        @if (state.currentEvent().status === 'open') {
          <p>Al iniciar el partido se cierran las inscripciones y la edición de equipos.</p>
          <button class="btn btn-primary btn-block" (click)="state.startMatch()">Iniciar partido</button>
        } @else if (!state.matchClosed()) {
          <p>Confirmá la selección: el reparto de cancha quedará cerrado.</p>
          <button class="btn btn-primary btn-block" [disabled]="!selectedIds().length || state.saving()" (click)="saveAndContinue()">Guardar y confirmar presentes</button>
        } @else {
          <p>Presentes confirmados. El reparto de cancha está cerrado.</p>
          <button class="btn btn-primary btn-block" routerLink="/partido/resumen">Ver resumen</button>
        }
      </div>
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

    .player-selection-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .player-select-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: white;
      padding: 12px 16px;
      border-radius: 14px;
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .player-select-row.checked {
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
      transition: all 0.2s ease;
      background: white;
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
export class MatchAttendanceCheckComponent {
  state = inject(EventStateService);
  private router = inject(Router);
  selectedIds = signal<string[]>([...this.state.currentEvent().matchPlayedPlayerIds]);

  confirmedSoccerPlayers = () => {
    const att = this.state.currentEvent().attendances;
    return this.state.players().filter(p => att[p.id]?.playsSoccer);
  };

  isPlayed(playerId: string) {
    return (this.state.matchClosed() ? this.state.currentEvent().matchPlayedPlayerIds : this.selectedIds()).includes(playerId);
  }

  toggle(playerId: string) {
    if (this.state.currentEvent().status !== 'playing' || this.state.saving()) return;
    this.selectedIds.update(ids => ids.includes(playerId) ? ids.filter(id => id !== playerId) : [...ids, playerId]);
  }

  goBack() {
    this.router.navigate(['/partido/equipos']);
  }

  async saveAndContinue() {
    if (await this.state.confirmMatch(this.selectedIds())) this.router.navigate(['/partido/resumen']);
  }
}
