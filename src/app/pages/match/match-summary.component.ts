import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-match-summary',
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
        <span class="header-title">Resumen</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-body">
        <div class="status-badge-container">
          <div class="status-pill">
            <span class="dot-live"></span>
            <span>Partido finalizado</span>
          </div>
          <span class="event-date">{{ state.currentEvent().title }}</span>
        </div>

        <!-- Metric Card -->
        <div class="metric-summary-card">
          <div class="metric-item">
            <span class="metric-label">Jugadores presentes</span>
            <span class="metric-value">{{ state.currentEvent().matchPlayedPlayerIds.length }}</span>
          </div>

          <div class="divider"></div>

          <div class="metric-item">
            <span class="metric-label">Precio de la cancha</span>
            <span class="metric-value">\${{ state.currentEvent().pitchPrice | number }}</span>
          </div>

          <div class="divider"></div>

          <div class="metric-item highlight-box">
            <span class="metric-label">Costo por jugador</span>
            <span class="metric-value-huge">\${{ state.matchCostPerPlayer() | number }}</span>
          </div>
        </div>

        <!-- Secondary link -->
        <div class="text-center-link">
          <button class="link-btn" routerLink="/partido/equipos">
            Ver equipos
          </button>
        </div>

        <!-- Main Action -->
        <button class="btn btn-primary btn-block" routerLink="/pagos/cancha">
          Ir a pagos de cancha
        </button>

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
      padding: 24px 18px;
    }

    .status-badge-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ECFDF5;
      color: #059669;
      font-size: 0.85rem;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: var(--radius-full);
      margin-bottom: 6px;
    }

    .dot-live {
      width: 8px;
      height: 8px;
      background: #10B981;
      border-radius: 50%;
    }

    .event-date {
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 500;
    }

    .metric-summary-card {
      background: white;
      border-radius: 20px;
      padding: 24px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      margin-bottom: 24px;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric-label {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .metric-value {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .divider {
      height: 1px;
      background: var(--border-color-light);
      margin: 16px 0;
    }

    .highlight-box {
      background: var(--primary-light);
      padding: 16px;
      border-radius: 14px;
      border: 1px solid #C7D2FE;
    }

    .highlight-box .metric-label {
      color: var(--primary);
    }

    .metric-value-huge {
      font-size: 2rem;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: -0.5px;
    }

    .text-center-link {
      text-align: center;
      margin-bottom: 20px;
    }

    .link-btn {
      background: none;
      border: none;
      color: var(--primary);
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
    }

    .btn-block {
      width: 100%;
      padding: 16px;
      font-size: 1rem;
    }
  `]
})
export class MatchSummaryComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  goBack() {
    this.router.navigate(['/partido/equipos']);
  }
}
