import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-dinner-summary',
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
        <span class="header-title">Resumen Cena</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-body">
        <!-- Success State Badge -->
        <div class="status-badge-container">
          <div class="icon-success-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="28" height="28">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 class="finished-title">Cena finalizada</h2>
          <span class="event-date">{{ state.currentEvent().title }}</span>
        </div>

        <!-- Metric Card -->
        <div class="metric-summary-card">
          <div class="metric-item">
            <span class="metric-label">Asistentes</span>
            <span class="metric-value">{{ state.currentEvent().dinnerAttendedPlayerIds.length }}</span>
          </div>

          <div class="divider"></div>

          <div class="metric-item">
            <span class="metric-label">Total de gastos</span>
            <span class="metric-value">\${{ state.dinnerTotalAmount() | number }}</span>
          </div>

          <div class="divider"></div>

          <div class="metric-item highlight-box dinner-accent">
            <span class="metric-label">Costo por persona</span>
            <span class="metric-value-huge">\${{ state.dinnerCostPerPerson() | number }}</span>
          </div>
        </div>

        <!-- Secondary link -->
        <div class="text-center-link">
          <button class="link-btn" routerLink="/cena/menu">
            Ver detalle de gastos
          </button>
        </div>

        <!-- Main Action -->
        <button class="btn btn-primary btn-block" routerLink="/pagos/cena">
          Ir a pagos de la cena
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

    .icon-success-circle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #10B981;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
      margin-bottom: 12px;
    }

    .finished-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .event-date {
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 500;
      margin-top: 4px;
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

    .highlight-box.dinner-accent {
      background: #FFF7ED;
      padding: 16px;
      border-radius: 14px;
      border: 1px solid #FFEDD5;
    }

    .highlight-box .metric-label {
      color: #EA580C;
    }

    .metric-value-huge {
      font-size: 2rem;
      font-weight: 900;
      color: #EA580C;
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
export class DinnerSummaryComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  goBack() {
    this.router.navigate(['/cena/asistentes']);
  }
}
