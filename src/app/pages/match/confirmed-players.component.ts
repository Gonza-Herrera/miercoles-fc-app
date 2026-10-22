import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';
import { Player } from '../../models/event.model';

type FilterTab = 'todos' | 'juegan' | 'cenan';

@Component({
  selector: 'app-confirmed-players',
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
        <span class="header-title">Confirmados</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-body">
        <div class="page-headline">
          <h2>Jugadores confirmados</h2>
        </div>

        <!-- Filter Tabs -->
        <div class="tabs-segmented">
          <button 
            type="button" 
            class="tab-btn" 
            [class.active]="activeTab() === 'todos'"
            (click)="activeTab.set('todos')">
            Todos ({{ totalCount() }})
          </button>
          <button 
            type="button" 
            class="tab-btn" 
            [class.active]="activeTab() === 'juegan'"
            (click)="activeTab.set('juegan')">
            Juegan ({{ state.soccerConfirmedCount() }})
          </button>
          <button 
            type="button" 
            class="tab-btn" 
            [class.active]="activeTab() === 'cenan'"
            (click)="activeTab.set('cenan')">
            Cenan ({{ state.dinnerConfirmedCount() }})
          </button>
        </div>

        <!-- Players List -->
        <div class="player-list">
          @for (player of filteredPlayers(); track player.id) {
            <div class="player-row">
              <div class="player-info">
                <img [src]="player.avatar" [alt]="player.name" class="player-avatar" />
                <span class="player-name">{{ player.name }}</span>
              </div>

              <!-- Status Badges -->
              @switch (getStatus(player.id)) {
                @case ('juega_y_cena') {
                  <span class="badge-status juega-cena">Juega + Cena</span>
                }
                @case ('solo_juega') {
                  <span class="badge-status solo-juega">Solo juega</span>
                }
                @case ('solo_cena') {
                  <span class="badge-status solo-cena">Solo cena</span>
                }
              }
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="action-footer-inline">
          @if ((auth.isAdmin() && state.currentEvent().status === 'open') || state.currentEvent().captainDraft) {
            <button class="btn btn-secondary btn-block" routerLink="/partido/capitanes">DT / Capitanes</button>
          }
          @if (state.canEditTeams()) {
            <button class="btn btn-primary btn-block" routerLink="/partido/armar-equipos">
              Armar equipos
            </button>
          }
          @if (state.currentEvent().teams?.teams?.length) {
            <button class="btn btn-primary btn-block" routerLink="/partido/equipos">
              Ver equipos
            </button>
          } @else if (!auth.isAdmin()) {
            <p>El administrador todavía no ha formado los equipos.</p>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      min-height: 100vh;
      background: var(--bg-app);
      padding-bottom: 90px;
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

    .content-body {
      padding: 20px 18px;
    }

    .page-headline h2 {
      font-size: 1.35rem;
      font-weight: 800;
      margin-bottom: 18px;
      color: var(--text-main);
    }

    .tabs-segmented {
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
      padding: 8px 6px;
      border-radius: 9px;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .tab-btn.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
    }

    .player-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .player-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: white;
      padding: 12px 16px;
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
    }

    .player-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .player-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      background: #CBD5E1;
    }

    .player-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
    }

    .action-footer-inline {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }

    .btn-block {
      width: 100%;
    }
  `]
})
export class ConfirmedPlayersComponent {
  auth = inject(AuthService);
  state = inject(EventStateService);
  private router = inject(Router);

  activeTab = signal<FilterTab>('todos');

  totalCount = computed(() => {
    const att = this.state.currentEvent().attendances;
    return Object.values(att).filter(a => a.playsSoccer || a.attendsDinner).length;
  });

  filteredPlayers = computed(() => {
    const tab = this.activeTab();
    const event = this.state.currentEvent();
    const all = this.state.players();

    return all.filter(p => {
      const att = event.attendances[p.id];
      if (!att) return false;
      if (tab === 'todos') return att.playsSoccer || att.attendsDinner;
      if (tab === 'juegan') return att.playsSoccer;
      if (tab === 'cenan') return att.attendsDinner;
      return false;
    });
  });

  getStatus(playerId: string) {
    return this.state.getPlayerStatus(playerId);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
