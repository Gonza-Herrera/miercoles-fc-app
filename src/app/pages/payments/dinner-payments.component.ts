import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-dinner-payments',
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
        <span class="header-title">Pagos de la cena</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        @if (!state.dinnerClosed()) {
          <p role="status">Los cobros se habilitan después de confirmar los asistentes y cerrar el reparto.</p>
        }
        <!-- Progress Header -->
        <div class="progress-card">
          <div class="progress-title-row">
            <span class="count-label">{{ state.dinnerPaidCount() }} de {{ state.currentEvent().dinnerAttendedPlayerIds.length }} pagaron</span>
            <span class="amount-label">\${{ state.dinnerTotalCollected() | number }} de \${{ state.dinnerTotalAmount() | number }}</span>
          </div>

          <!-- Progress Bar -->
          <div class="progress-track">
            <div class="progress-bar" [style.width.%]="progressPercent()"></div>
          </div>
        </div>

        <!-- Attendees Payment List -->
        <details style="margin: 16px 0">
          <summary>Historial de cobros</summary>
          @for (payment of history(); track payment.id) {
            <p>{{ state.getPlayer(payment.player_id).name }} · \${{ payment.amount | number:'1.2-2' }} · {{ payment.recorded_at | date:'dd/MM HH:mm' }}
              {{ payment.voided_at ? '· Anulado' : '· Vigente' }}
            </p>
          } @empty { <p>Aún no hay cobros registrados.</p> }
        </details>
        <div class="payments-list">
          @for (player of attendedPlayers(); track player.id) {
            <div 
              class="payment-row"
              [class.paid]="isPaid(player.id)"
              [style.cursor]="auth.isAdmin() && state.dinnerClosed() ? 'pointer' : 'default'"
              [attr.role]="auth.isAdmin() ? 'button' : null"
              [attr.tabindex]="auth.isAdmin() ? 0 : null"
              [attr.aria-disabled]="!auth.isAdmin() || !state.dinnerClosed() || state.saving()"
              [attr.aria-label]="(isPaid(player.id) ? 'Anular pago de ' : 'Registrar pago de ') + player.name"
              (keydown.enter)="toggle(player.id)"
              (click)="toggle(player.id)">
              <div class="player-profile">
                <img [src]="player.avatar" [alt]="player.name" class="avatar-img" />
                <div><span class="player-name">{{ player.name }}</span>
                  @if (state.paymentFor('dinner', player.id); as payment) {
                    <small style="display:block">Cobrado {{ payment.recorded_at | date:'dd/MM HH:mm' }}</small>
                  }
                </div>
              </div>

              <div class="amount-check-group">
                <span class="player-fee">\${{ state.shareFor('dinner', player.id) | number:'1.2-2' }}</span>
                <div class="payment-check" [class.checked]="isPaid(player.id)">
                  @if (isPaid(player.id)) {
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="16" height="16">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      @if (pendingVoid(); as playerId) {
        <div class="payment-confirmation" role="dialog" aria-modal="true" aria-label="Anular cobro">
          <p>¿Anular el cobro de {{ state.getPlayer(playerId).name }}? El registro quedará en el historial.</p>
          <button class="btn btn-secondary" (click)="pendingVoid.set(null)">Cancelar</button>
          <button class="btn btn-primary" [disabled]="state.saving()" (click)="confirmVoid()">Anular cobro</button>
        </div>
      }
      <!-- Footer Pending Summary -->
      <div class="footer-bar-pending">
        <div class="pending-box">
          <span class="pend-label">Pendiente</span>
          <span class="pend-amount">\${{ state.dinnerPendingAmount() | number }}</span>
        </div>
        <button class="btn btn-primary" routerLink="/pagos/resumen-total">
          Resumen total
        </button>
      </div>
    </div>
  `,
  styles: [`
    .payment-confirmation { position: fixed; bottom: 160px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 448px; padding: 20px; border-radius: 16px; background: white; border: 1px solid var(--border-color); box-shadow: 0 0 0 100vmax #0006; z-index: 1000; }
    .payment-confirmation p { margin-bottom: 16px; }

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
      padding: 20px 18px 160px;
    }

    .progress-card {
      background: white;
      border-radius: 18px;
      padding: 18px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      margin-bottom: 20px;
    }

    .progress-title-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 12px;
    }

    .amount-label {
      color: var(--text-muted);
    }

    .progress-track {
      height: 10px;
      background: #E2E8F0;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      background: #10B981;
      border-radius: 999px;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .payments-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .payment-row {
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

    .payment-row.paid {
      border-color: #A7F3D0;
      background: #F0FDF4;
    }

    .player-profile {
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

    .amount-check-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .player-fee {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-muted);
    }

    .payment-row.paid .player-fee {
      color: #059669;
    }

    .payment-check {
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

    .payment-check.checked {
      background: var(--primary);
      border-color: var(--primary);
    }

    .footer-bar-pending {
      position: fixed;
      bottom: var(--bottom-nav-height);
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--border-color);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 45;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
    }

    .pending-box {
      display: flex;
      flex-direction: column;
    }

    .pend-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
    }

    .pend-amount {
      font-size: 1.25rem;
      font-weight: 800;
      color: #EA580C;
    }
  `]
})
export class DinnerPaymentsComponent {
  state = inject(EventStateService);
  auth = inject(AuthService);
  pendingVoid = signal<string | null>(null);
  private router = inject(Router);

  attendedPlayers = () => {
    const ids = this.state.currentEvent().dinnerAttendedPlayerIds;
    return ids.map(id => this.state.getPlayer(id));
  };

  isPaid(playerId: string) {
    return this.state.currentEvent().dinnerPaidPlayerIds.includes(playerId);
  }

  async toggle(playerId: string) {
    if (!this.auth.isAdmin() || !this.state.dinnerClosed() || this.state.saving()) return;
    if (this.isPaid(playerId)) this.pendingVoid.set(playerId);
    else await this.state.setPayment('dinner', playerId, true);
  }

  async confirmVoid() {
    const id = this.pendingVoid();
    if (id && await this.state.setPayment('dinner', id, false)) this.pendingVoid.set(null);
  }

  history = () => this.state.payments().filter(p => p.kind === 'dinner');

  progressPercent = () => {
    const total = this.state.dinnerTotalAmount();
    if (!total) return 0;
    return Math.min(100, (this.state.dinnerTotalCollected() / total) * 100);
  };

  goBack() {
    this.router.navigate(['/cena/resumen']);
  }
}
