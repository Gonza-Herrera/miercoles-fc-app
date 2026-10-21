import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-total-summary',
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
        <span class="header-title">Resumen total</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <div class="page-headline">
          <h2>Resumen del evento</h2>
          <p class="subtitle">{{ state.currentEvent().title }}</p>
        </div>

        <!-- Bloque Cancha -->
        <div class="summary-card">
          <div class="card-icon-title">
            <div class="icon-bubble pitch-bubble">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="4"></circle>
              </svg>
            </div>
            <div class="title-details">
              <h3>Cancha</h3>
              <p class="meta-sub">{{ state.currentEvent().matchPlayedPlayerIds.length }} jugadores</p>
            </div>
            <span class="total-badge">\${{ state.currentEvent().pitchPrice | number }}</span>
          </div>

          <div class="card-breakdown">
            <div class="breakdown-row">
              <span>Pagaron</span>
              <span class="val-success">{{ state.matchPaidCount() }}/{{ state.currentEvent().matchPlayedPlayerIds.length }}</span>
            </div>
            <div class="breakdown-row">
              <span>Pendiente</span>
              <span class="val-danger">\${{ state.matchPendingAmount() | number }}</span>
            </div>
          </div>

          <button class="card-action-link" routerLink="/pagos/cancha">
            Ver detalle de pagos cancha →
          </button>
        </div>

        <!-- Bloque Cena -->
        <div class="summary-card">
          <div class="card-icon-title">
            <div class="icon-bubble dinner-bubble">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <path d="M18 2v8a4 4 0 0 1-4 4H8"></path>
                <path d="M6 2v20"></path>
                <path d="M10 2v6"></path>
                <path d="M14 2v6"></path>
              </svg>
            </div>
            <div class="title-details">
              <h3>Cena</h3>
              <p class="meta-sub">{{ state.currentEvent().dinnerAttendedPlayerIds.length }} personas</p>
            </div>
            <span class="total-badge dinner-badge">\${{ state.dinnerTotalAmount() | number }}</span>
          </div>

          <div class="card-breakdown">
            <div class="breakdown-row">
              <span>Pagaron</span>
              <span class="val-success">{{ state.dinnerPaidCount() }}/{{ state.currentEvent().dinnerAttendedPlayerIds.length }}</span>
            </div>
            <div class="breakdown-row">
              <span>Pendiente</span>
              <span class="val-danger">\${{ state.dinnerPendingAmount() | number }}</span>
            </div>
          </div>

          <button class="card-action-link" routerLink="/pagos/cena">
            Ver detalle de pagos cena →
          </button>
        </div>

        <!-- Global Combined Balance Box -->
        <div class="global-balance-box">
          <span class="balance-label">Pendiente total</span>
          <span class="balance-value">\${{ state.totalPendingAmount() | number }}</span>
        </div>

        <!-- Share whatsapp button -->
        <button class="btn btn-primary btn-block share-btn" (click)="shareWhatsapp()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
          Compartir resumen en WhatsApp
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

    .content-scroll {
      padding: 24px 18px 40px;
    }

    .page-headline h2 {
      font-size: 1.45rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 2px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: white;
      border-radius: 20px;
      padding: 20px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      margin-bottom: 16px;
    }

    .card-icon-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .icon-bubble {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pitch-bubble {
      background: #ECFDF5;
      color: #059669;
    }

    .dinner-bubble {
      background: #FFF7ED;
      color: #EA580C;
    }

    .title-details {
      flex: 1;
    }

    .title-details h3 {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .meta-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .total-badge {
      font-weight: 800;
      font-size: 1.15rem;
      color: #059669;
    }

    .total-badge.dinner-badge {
      color: #EA580C;
    }

    .card-breakdown {
      background: var(--bg-app);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
    }

    .breakdown-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .val-success {
      color: #059669;
      font-weight: 700;
    }

    .val-danger {
      color: #EA580C;
      font-weight: 700;
    }

    .card-action-link {
      background: none;
      border: none;
      color: var(--primary);
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0;
    }

    .global-balance-box {
      background: #FFF1F2;
      border: 1px solid #FECDD3;
      border-radius: 18px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 24px;
      margin-bottom: 20px;
    }

    .balance-label {
      font-size: 0.85rem;
      color: #9F1239;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .balance-value {
      font-size: 2.25rem;
      font-weight: 900;
      color: #BE123C;
      letter-spacing: -0.5px;
      margin-top: 4px;
    }

    .share-btn {
      width: 100%;
      padding: 16px;
      background: #059669;
      box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
    }

    .share-btn:hover {
      background: #047857;
    }
  `]
})
export class TotalSummaryComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  goBack() {
    this.router.navigate(['/pagos/cancha']);
  }

  shareWhatsapp() {
    const text = `⚽ *Miércoles FC - Resumen ${this.state.currentEvent().title}* 🥩\n\n` +
      `*Cancha:* $${this.state.currentEvent().pitchPrice} (Pagaron ${this.state.matchPaidCount()}/${this.state.currentEvent().matchPlayedPlayerIds.length})\n` +
      `*Cena:* $${this.state.dinnerTotalAmount()} (Pagaron ${this.state.dinnerPaidCount()}/${this.state.currentEvent().dinnerAttendedPlayerIds.length})\n\n` +
      `*Pendiente total por cobrar:* $${this.state.totalPendingAmount()}\n\n¡Por favor los que faltan recuerden transferir! 🙌`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
}
