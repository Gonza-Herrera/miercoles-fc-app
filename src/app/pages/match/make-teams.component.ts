import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';
import { Player, Team } from '../../models/event.model';

@Component({
  selector: 'app-make-teams',
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
        <span class="header-title">Armar equipos</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-body">
        <div class="page-headline">
          <h2>Armar equipos</h2>
          <p class="subtitle">{{ soccerPlayers().length }} jugadores confirmados</p>
        </div>

        <a class="btn btn-secondary btn-block" style="margin-bottom:16px" routerLink="/partido/capitanes">Armar con DT / Capitanes</a>
        <!-- Mode Toggle (Aleatorio vs Manual) -->
        <div class="mode-toggle">
          <button 
            type="button" 
            class="mode-btn" 
            [class.active]="mode() === 'aleatorio'"
            (click)="setMode('aleatorio')">
            Aleatorio
          </button>
          <button 
            type="button" 
            class="mode-btn" 
            [class.active]="mode() === 'manual'"
            (click)="setMode('manual')">
            Manual
          </button>
        </div>

        <!-- SECCIÓN MODO ALEATORIO -->
        @if (mode() === 'aleatorio') {
          <button class="btn btn-primary btn-block generate-btn" (click)="generateRandom()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
              <polyline points="16 3 21 3 21 8"></polyline>
              <line x1="4" y1="20" x2="21" y2="3"></line>
              <polyline points="21 16 21 21 16 21"></polyline>
              <line x1="15" y1="15" x2="21" y2="21"></line>
              <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
            Sortear y generar equipos
          </button>

          <p class="info-note">
            {{ teamPlanDescription() }}
          </p>

          <!-- Available players list -->
          <div class="available-section">
            <h3>Jugadores disponibles</h3>
            <div class="player-list">
              @for (player of soccerPlayers(); track player.id) {
                <div class="player-card">
                  <img [src]="player.avatar" [alt]="player.name" class="avatar-img" />
                  <div class="player-center">
                    <span class="player-name">{{ player.name }}</span>
                    <!-- Selector de Rol táctico -->
                    <button class="role-pill-btn" (click)="cycleRole(player.id, player.role)">
                      Posición: <strong>{{ player.role || 'MED' }}</strong>
                    </button>
                  </div>
                  <!-- Indicador de equipo actual -->
                  <span class="team-badge" [class.unassigned]="!getPlayerTeam(player.id)">
                    {{ getPlayerTeam(player.id)?.name || 'Sin equipo' }}
                  </span>
                </div>
              }
            </div>
          </div>
        }

        <!-- SECCIÓN MODO MANUAL (ASIGNACIÓN DIRECTA A EQUIPOS) -->
        @if (mode() === 'manual') {
          <div class="manual-teams-container">
            <p class="manual-hint">
              Asigna a cada jugador su equipo y posición haciendo clic en las opciones:
            </p>

            <!-- Cards de Equipos Configurados -->
            <div class="teams-grid">
              @for (team of activeTeams(); track team.id) {
                <div class="team-column-card">
                  <div class="team-col-header">
                    <h4>{{ team.name }}</h4>
                    <span class="team-count">{{ team.playerIds.length }} jugadores</span>
                  </div>

                  <div class="team-members">
                    @for (playerId of team.playerIds; track playerId) {
                      @let p = state.getPlayer(playerId);
                      <div class="team-member-chip">
                        <img [src]="p.avatar" [alt]="p.name" class="chip-avatar" />
                        <span class="chip-name">{{ p.name }}</span>
                        <!-- Botón de cambiar rol -->
                        <button class="chip-role" (click)="cycleRole(p.id, p.role)">
                          {{ p.role || 'MED' }}
                        </button>
                        <!-- Selector de mover de equipo -->
                        <button class="chip-move-btn" (click)="openMoveModal(p)">
                          ⇄
                        </button>
                      </div>
                    } @empty {
                      <div class="empty-team-placeholder">Ningún jugador asignado aún</div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Jugadores sin asignar o lista general para alternar -->
            <div class="available-section" style="margin-top: 20px;">
              <h3>Gestionar asignación rápida</h3>
              <div class="player-list">
                @for (player of soccerPlayers(); track player.id) {
                  <div class="player-card manual-player-row">
                    <div class="player-meta-left">
                      <img [src]="player.avatar" [alt]="player.name" class="avatar-img" />
                      <div>
                        <span class="player-name">{{ player.name }}</span>
                        <div class="sub-role-bar">
                          <span class="role-clickable" (click)="cycleRole(player.id, player.role)">
                            Posición: <strong>{{ player.role || 'MED' }} ▾</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Selector botones de equipo para cada jugador -->
                    <div class="team-selectors-group">
                      @for (team of activeTeams(); track team.id) {
                        <button 
                          type="button" 
                          class="team-toggle-pill"
                          [class.active]="isPlayerInTeam(player.id, team.id)"
                          (click)="assignTeam(player.id, team.id)">
                          {{ team.name.replace('Equipo ', '') }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Botón Ver Cancha -->
            <div style="margin-top: 24px;">
              <button class="btn btn-primary btn-block" routerLink="/partido/equipos">
                Ver equipos en la cancha
              </button>
            </div>
          </div>
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

    .page-headline h2 {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 2px;
      margin-bottom: 20px;
    }

    .mode-toggle {
      display: flex;
      background: #E2E8F0;
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 16px;
      gap: 4px;
    }

    .mode-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 10px;
      border-radius: 9px;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mode-btn.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
    }

    .generate-btn {
      width: 100%;
      padding: 16px;
      font-size: 1.05rem;
      border-radius: 16px;
      margin-bottom: 12px;
    }

    .info-note {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .available-section h3 {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 14px;
    }

    .player-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .player-card {
      display: flex;
      align-items: center;
      background: white;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--border-color);
      justify-content: space-between;
    }

    .manual-player-row {
      flex-wrap: wrap;
      gap: 8px;
    }

    .player-meta-left {
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

    .player-center {
      display: flex;
      flex-direction: column;
      flex: 1;
      margin-left: 12px;
    }

    .player-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
    }

    .role-pill-btn {
      background: none;
      border: none;
      font-size: 0.75rem;
      color: var(--primary);
      cursor: pointer;
      padding: 0;
      text-align: left;
      margin-top: 2px;
    }

    .role-clickable {
      font-size: 0.75rem;
      color: var(--primary);
      cursor: pointer;
    }

    .team-badge {
      font-size: 0.75rem;
      font-weight: 700;
      background: #EEF2FF;
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 8px;
    }

    .team-badge.unassigned {
      background: #F1F5F9;
      color: var(--text-muted);
    }

    /* Manual Mode Styles */
    .manual-hint {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 14px;
    }

    .teams-grid {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .team-column-card {
      background: white;
      border-radius: 16px;
      border: 1px solid var(--border-color);
      padding: 14px;
    }

    .team-col-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color-light);
    }

    .team-col-header h4 {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .team-count {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--primary);
      background: #EEF2FF;
      padding: 2px 8px;
      border-radius: 6px;
    }

    .team-members {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .team-member-chip {
      display: flex;
      align-items: center;
      background: #F8FAFC;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 6px 10px;
      gap: 8px;
    }

    .chip-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
    }

    .chip-name {
      font-weight: 700;
      font-size: 0.85rem;
    }

    .chip-role {
      background: var(--primary-light);
      border: 1px solid #C7D2FE;
      color: var(--primary);
      font-size: 0.65rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
    }

    .chip-move-btn {
      background: none;
      border: none;
      font-size: 0.9rem;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0 2px;
    }

    .empty-team-placeholder {
      font-size: 0.8rem;
      color: var(--text-light);
      font-style: italic;
      padding: 10px 0;
    }

    /* Selectores rápidos de equipo */
    .team-selectors-group {
      display: flex;
      gap: 6px;
    }

    .team-toggle-pill {
      border: 1px solid var(--border-color);
      background: white;
      border-radius: 8px;
      padding: 6px 12px;
      font-weight: 800;
      font-size: 0.8rem;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s ease;
    }

    .team-toggle-pill.active {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
    }

    .btn-block {
      width: 100%;
    }
  `]
})
export class MakeTeamsComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  mode = signal<'aleatorio' | 'manual'>('aleatorio');

  soccerPlayers = computed(() => {
    const att = this.state.currentEvent().attendances;
    return this.state.players().filter(p => att[p.id]?.playsSoccer);
  });

  activeTeams = computed<Team[]>(() => {
    const teamsObj = this.state.currentEvent().teams;
    if (teamsObj && teamsObj.teams.length > 0) {
      return teamsObj.teams;
    }
    // Si todavía no hay equipos generados, inicializar los equipos según el caso
    const n = this.soccerPlayers().length;
    const plan = this.state.getTeamPlan(n);
    const teamNames = ['Equipo A', 'Equipo B', 'Equipo C', 'Equipo D'];
    const teamIds = ['teamA', 'teamB', 'teamC', 'teamD'];

    return Array.from({ length: plan.teamCount }, (_, i) => ({
      id: teamIds[i] || `team_${i + 1}`,
      name: teamNames[i] || `Equipo ${i + 1}`,
      playerIds: []
    }));
  });

  teamPlanDescription = computed(() => {
    const n = this.soccerPlayers().length;
    const plan = this.state.getTeamPlan(n);
    const detail = plan.teamSizes.map((s, idx) => `Equipo ${String.fromCharCode(65 + idx)}: ${s}`).join(', ');
    return `Se armarán ${plan.teamCount} equipos (${detail}) - Total: ${n} jugadores`;
  });

  setMode(newMode: 'aleatorio' | 'manual') {
    this.mode.set(newMode);
    // Si pasa a manual y no hay estructura de equipos guardada, inicializarla
    if (newMode === 'manual') {
      const current = this.state.currentEvent().teams;
      if (!current || !current.teams || current.teams.length === 0) {
        this.state.updateEvent(evt => ({
          ...evt,
          teams: { teams: this.activeTeams() }
        }));
      }
    }
  }

  isPlayerInTeam(playerId: string, teamId: string): boolean {
    const team = this.activeTeams().find(t => t.id === teamId);
    return team ? team.playerIds.includes(playerId) : false;
  }

  getPlayerTeam(playerId: string): Team | undefined {
    return this.activeTeams().find(t => t.playerIds.includes(playerId));
  }

  assignTeam(playerId: string, teamId: string) {
    // Si ya está en ese equipo, no hace nada o lo quita; si hace click lo asigna a ese equipo
    this.state.assignPlayerToTeam(playerId, teamId);
  }

  cycleRole(playerId: string, currentRole?: string) {
    const roles: Array<'ARQ' | 'DEF' | 'MED' | 'DEL'> = ['ARQ', 'DEF', 'MED', 'DEL'];
    const currIndex = roles.indexOf((currentRole as any) || 'MED');
    const nextRole = roles[(currIndex + 1) % roles.length];
    this.state.updatePlayerRole(playerId, nextRole);
  }

  openMoveModal(player: Player) {
    const teams = this.activeTeams();
    const currentTeam = this.getPlayerTeam(player.id);
    const otherTeams = teams.filter(t => t.id !== currentTeam?.id);

    if (otherTeams.length > 0) {
      // Rotar al siguiente equipo disponible
      this.assignTeam(player.id, otherTeams[0].id);
    }
  }

  async generateRandom() {
    if (!await this.state.generateRandomTeams()) return;
    this.router.navigate(['/partido/equipos']);
  }

  goBack() {
    this.router.navigate(['/partido/confirmados']);
  }
}
