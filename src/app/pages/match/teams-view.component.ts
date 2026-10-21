import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';
import { Player, Team } from '../../models/event.model';

@Component({
  selector: 'app-teams-view',
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
        <span class="header-title">Equipos</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-body">
        <!-- Dynamic Team Toggle Tabs (supports 2, 3 or 4 teams) -->
        <div class="team-tabs">
          @for (team of allTeams(); track team.id) {
            <button 
              type="button" 
              class="tab-btn" 
              [class.active]="selectedTeamId() === team.id"
              (click)="selectedTeamId.set(team.id)">
              {{ team.name }}
            </button>
          }
        </div>

        <!-- Soccer Pitch Container -->
        <div class="pitch-container">
          <div class="pitch-header">
            <h3>{{ activeTeam()?.name || 'Equipo' }}</h3>
            <span class="player-count">{{ teamPlayers().length }} jugadores</span>
          </div>

          <!-- Cancha de Fútbol Verde Táctica -->
          <div class="soccer-pitch">
            <!-- Marcaciones de Cancha -->
            <div class="pitch-outer-lines">
              <div class="pitch-half-line"></div>
              <div class="pitch-center-circle"></div>
              <div class="pitch-penalty-area-top"></div>
              <div class="pitch-penalty-area-bottom"></div>
            </div>

            <!-- Posiciones tácticas exactas con coordenadas sobre la cancha -->
            <div class="players-formation">
              @for (item of positionedPlayers(); track item.player.id) {
                <div 
                  class="pitch-player-node" 
                  [style.left.%]="item.x" 
                  [style.top.%]="item.y"
                  [style.cursor]="auth.isAdmin() ? 'pointer' : 'default'"
                  (click)="openPlayerModal(item.player)">
                  <img 
                    [src]="item.player.avatar" 
                    [alt]="item.player.name" 
                    class="node-avatar" 
                    [class.gk-border]="item.role === 'ARQ'" />
                  <span class="node-name">{{ item.player.name }}</span>
                  <span class="node-role-badge" [class.gk-badge]="item.role === 'ARQ'">
                    {{ item.role }}
                  </span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Modal interactivo para cambiar rol táctico o transferir de equipo -->
        @if (state.canEditTeams() && selectedPlayerForEdit(); as player) {
          <div class="player-edit-backdrop" (click)="selectedPlayerForEdit.set(null)">
            <div class="player-edit-modal" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <div class="modal-player-info">
                  <img [src]="player.avatar" [alt]="player.name" class="modal-avatar" />
                  <div>
                    <h4>{{ player.name }}</h4>
                    <span class="modal-sub">Editar posición o equipo</span>
                  </div>
                </div>
                <button class="modal-close-btn" (click)="selectedPlayerForEdit.set(null)">✕</button>
              </div>

              <!-- Selector de Posición / Rol -->
              <div class="modal-section">
                <label>Posición en la cancha:</label>
                <div class="role-selector-pills">
                  @for (r of ['ARQ', 'DEF', 'MED', 'DEL']; track r) {
                    <button 
                      type="button" 
                      class="role-pill" 
                      [class.active]="player.role === r"
                      (click)="changePlayerRole(player.id, r)">
                      {{ r }}
                    </button>
                  }
                </div>
              </div>

              <!-- Selector de Equipo -->
              <div class="modal-section">
                <label>Transferir a equipo:</label>
                <div class="team-selector-pills">
                  @for (t of allTeams(); track t.id) {
                    <button 
                      type="button" 
                      class="team-move-pill"
                      [class.active]="activeTeam()?.id === t.id"
                      (click)="movePlayerToTeam(player.id, t.id)">
                      {{ t.name }}
                    </button>
                  }
                </div>
              </div>

              <button class="btn btn-primary btn-block modal-done-btn" (click)="selectedPlayerForEdit.set(null)">
                Listo
              </button>
            </div>
          </div>
        }

        <!-- Acciones Inferiores -->
        @if (state.canEditTeams()) {
        <div class="action-buttons-row">
          <button class="btn btn-secondary action-btn" (click)="editTeams()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Editar
          </button>
          <button class="btn btn-secondary action-btn" (click)="reshuffle()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Volver a sortear
          </button>
        </div>

        }
        @if (auth.isAdmin()) {
        <!-- Proceed to match day button -->
        <button class="btn btn-primary btn-block match-done-btn" (click)="goToMatchDay()">
          {{ state.currentEvent().status === 'open' ? 'Iniciar partido y cerrar inscripciones' : 'Ir al día del partido' }}
        </button>
        }

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

    .team-tabs {
      display: flex;
      background: #E2E8F0;
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 16px;
      gap: 4px;
      overflow-x: auto;
    }

    .tab-btn {
      flex: 1;
      min-width: 80px;
      border: none;
      background: transparent;
      padding: 10px 8px;
      border-radius: 9px;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
    }

    .tab-btn.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
    }

    .pitch-container {
      background: white;
      border-radius: 20px;
      padding: 18px 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      margin-bottom: 16px;
    }

    .pitch-header {
      text-align: center;
      margin-bottom: 14px;
    }

    .pitch-header h3 {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .player-count {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    /* Green Tactical Pitch */
    .soccer-pitch {
      position: relative;
      background: radial-gradient(circle, #2e7d32 0%, #1b5e20 100%);
      border: 2px solid rgba(255, 255, 255, 0.6);
      border-radius: 16px;
      min-height: 420px;
      overflow: hidden;
      box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px 8px;
    }

    .pitch-outer-lines {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .pitch-half-line {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 2px;
      background: rgba(255, 255, 255, 0.4);
    }

    .pitch-center-circle {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 80px;
      height: 80px;
      transform: translate(-50%, -50%);
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-radius: 50%;
    }

    .pitch-penalty-area-top {
      position: absolute;
      top: 0;
      left: 50%;
      width: 120px;
      height: 50px;
      transform: translateX(-50%);
      border-bottom: 2px solid rgba(255, 255, 255, 0.4);
      border-left: 2px solid rgba(255, 255, 255, 0.4);
      border-right: 2px solid rgba(255, 255, 255, 0.4);
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }

    .pitch-penalty-area-bottom {
      position: absolute;
      bottom: 0;
      left: 50%;
      width: 120px;
      height: 50px;
      transform: translateX(-50%);
      border-top: 2px solid rgba(255, 255, 255, 0.4);
      border-left: 2px solid rgba(255, 255, 255, 0.4);
      border-right: 2px solid rgba(255, 255, 255, 0.4);
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }

    /* Tactical Positions */
    .players-formation {
      position: absolute;
      inset: 0;
      z-index: 5;
    }

    .pitch-player-node {
      position: absolute;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .node-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      object-fit: cover;
      background: #475569;
    }

    .gk-border {
      border-color: #FACC15;
    }

    .node-name {
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      margin-top: 4px;
    }

    .node-role-badge {
      position: absolute;
      bottom: 14px;
      right: -4px;
      background: #3B82F6;
      color: white;
      font-size: 0.6rem;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 4px;
      border: 1px solid white;
    }

    .gk-badge {
      background: #EAB308;
    }

    .action-buttons-row {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .action-btn {
      flex: 1;
      padding: 12px;
      font-size: 0.9rem;
    }

    .match-done-btn {
      width: 100%;
      padding: 14px;
    }

    /* Modal de Edición de Jugador */
    .player-edit-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .player-edit-modal {
      background: white;
      width: 100%;
      max-width: 480px;
      border-top-left-radius: 24px;
      border-top-right-radius: 24px;
      padding: 24px 20px 32px;
      animation: slideUp 0.25s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .modal-player-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .modal-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
    }

    .modal-header h4 {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .modal-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .modal-close-btn {
      background: #F1F5F9;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 0.9rem;
      cursor: pointer;
      color: var(--text-muted);
    }

    .modal-section {
      margin-bottom: 20px;
    }

    .modal-section label {
      display: block;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 10px;
    }

    .role-selector-pills,
    .team-selector-pills {
      display: flex;
      gap: 8px;
    }

    .role-pill {
      flex: 1;
      padding: 10px;
      border-radius: 12px;
      border: 1.5px solid var(--border-color);
      background: white;
      font-weight: 800;
      font-size: 0.9rem;
      cursor: pointer;
      color: var(--text-main);
      transition: all 0.15s ease;
    }

    .role-pill.active {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .team-move-pill {
      flex: 1;
      padding: 10px;
      border-radius: 12px;
      border: 1.5px solid var(--border-color);
      background: white;
      font-weight: 800;
      font-size: 0.9rem;
      cursor: pointer;
      color: var(--text-main);
      transition: all 0.15s ease;
    }

    .team-move-pill.active {
      background: #059669;
      border-color: #059669;
      color: white;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
    }

    .modal-done-btn {
      width: 100%;
      margin-top: 10px;
    }
  `]
})
export class TeamsViewComponent {
  auth = inject(AuthService);
  state = inject(EventStateService);
  private router = inject(Router);

  selectedTeamId = signal<string>('teamA');
  selectedPlayerForEdit = signal<Player | null>(null);

  allTeams = computed<Team[]>(() => {
    const teamsObj = this.state.currentEvent().teams;
    if (!teamsObj || !teamsObj.teams) return [];
    return teamsObj.teams;
  });

  activeTeam = computed<Team | undefined>(() => {
    const list = this.allTeams();
    if (!list.length) return undefined;
    return list.find(t => t.id === this.selectedTeamId()) || list[0];
  });

  teamPlayers = computed<Player[]>(() => {
    const team = this.activeTeam();
    if (!team) return [];
    return team.playerIds.map(id => this.state.getPlayer(id));
  });

  /** Draw each player in their assigned role, regardless of roster order or team size. */
  positionedPlayers = computed(() => {
    const players = this.teamPlayers();
    const lines: Array<{ role: NonNullable<Player['role']>; y: number }> = [
      { role: 'ARQ', y: 88 },
      { role: 'DEF', y: 68 },
      { role: 'MED', y: 44 },
      { role: 'DEL', y: 18 }
    ];
    const result: Array<{ player: Player; role: NonNullable<Player['role']>; x: number; y: number }> = [];

    for (const line of lines) {
      const group = players.filter(player => (player.role ?? 'MED') === line.role);
      const rowCount = Math.ceil(group.length / 3);
      for (let row = 0; row < rowCount; row++) {
        const rowPlayers = group.slice(row * 3, row * 3 + 3);
        const spacing = rowCount > 1 ? Math.min(12, 16 / (rowCount - 1)) : 0;
        const y = line.y + (row - (rowCount - 1) / 2) * spacing;
        rowPlayers.forEach((player, index) => {
          const x = rowPlayers.length === 1 ? 50 :
            rowPlayers.length === 2 ? 28 + index * 44 : 20 + index * 30;
          result.push({ player, role: line.role, x, y });
        });
      }
    }
    return result;
  });

  openPlayerModal(player: Player) {
    if (!this.state.canEditTeams()) return;
    this.selectedPlayerForEdit.set(player);
  }

  async changePlayerRole(playerId: string, role: string) {
    if (!this.state.canEditTeams()) return;
    if (!await this.state.updatePlayerRole(playerId, role as any)) return;
    // Actualizar jugador en el modal activo
    const updated = this.state.getPlayer(playerId);
    this.selectedPlayerForEdit.set(updated);
  }

  async movePlayerToTeam(playerId: string, targetTeamId: string) {
    if (!this.state.canEditTeams()) return;
    if (!await this.state.assignPlayerToTeam(playerId, targetTeamId)) return;
    // Cambiar la vista al equipo al que fue transferido si se desea
    this.selectedTeamId.set(targetTeamId);
    const updated = this.state.getPlayer(playerId);
    this.selectedPlayerForEdit.set(updated);
  }

  goBack() {
    this.router.navigate(['/partido/confirmados']);
  }

  async reshuffle() {
    if (!this.state.canEditTeams()) return;
    if (!await this.state.generateRandomTeams()) return;
    const teams = this.allTeams();
    if (teams.length && !teams.some(t => t.id === this.selectedTeamId())) {
      this.selectedTeamId.set(teams[0].id);
    }
  }

  async goToMatchDay() {
    if (!this.auth.isAdmin()) return;
    if (this.state.currentEvent().status === 'open') {
      if (!await this.state.startMatch()) return;
    }
    this.router.navigate([this.state.matchClosed() ? '/partido/resumen' : '/partido/presentes']);
  }

  editTeams() {
    if (!this.state.canEditTeams()) return;
    this.router.navigate(['/partido/armar-equipos']);
  }
}

