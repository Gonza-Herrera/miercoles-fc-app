import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-attendance',
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
        <span class="header-title">Confirmación</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <!-- Event subheader -->
        <div class="event-headline">
          <h2>{{ state.currentEvent().title }}</h2>
          <p>Confirmá tu asistencia</p>
        </div>

        <!-- SECCIÓN PARTIDO DE FÚTBOL -->
        <div class="attendance-card">
          <div class="section-title">
            <span>Partido de fútbol</span>
          </div>

          <div class="options-container">
            <!-- Opción: Voy a jugar -->
            <button 
              type="button"
              class="option-pill" 
              [class.selected]="playsSoccer()"
              (click)="playsSoccer.set(true)">
              <div class="option-icon soccer-bullet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="4"></circle>
                </svg>
              </div>
              <span class="option-text">Voy a jugar</span>
              @if (playsSoccer()) {
                <div class="check-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              }
            </button>

            <!-- Opción: No voy a jugar -->
            <button 
              type="button"
              class="option-pill" 
              [class.selected]="!playsSoccer()"
              (click)="playsSoccer.set(false)">
              <div class="option-icon cross-bullet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
              <span class="option-text">No voy a jugar</span>
              @if (!playsSoccer()) {
                <div class="check-mark cross-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              }
            </button>
          </div>
        </div>

        <!-- SECCIÓN CENA -->
        <div class="attendance-card dinner-section">
          <div class="section-title">
            <span>Cena</span>
          </div>

          <div class="options-container">
            <!-- Opción: Voy a comer -->
            <button 
              type="button"
              class="option-pill dinner-pill" 
              [class.selected]="attendsDinner()"
              (click)="attendsDinner.set(true)">
              <div class="option-icon dinner-bullet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M18 2v8a4 4 0 0 1-4 4H8"></path>
                  <path d="M6 2v20"></path>
                  <path d="M10 2v6"></path>
                  <path d="M14 2v6"></path>
                </svg>
              </div>
              <span class="option-text">Voy a comer</span>
              @if (attendsDinner()) {
                <div class="check-mark dinner-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              }
            </button>

            <!-- Opción: No voy a comer -->
            <button 
              type="button"
              class="option-pill" 
              [class.selected]="!attendsDinner()"
              (click)="attendsDinner.set(false)">
              <div class="option-icon cross-bullet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
              <span class="option-text">No voy a comer</span>
              @if (!attendsDinner()) {
                <div class="check-mark cross-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              }
            </button>
          </div>
        </div>

      </div>

      <!-- Action Button at Bottom -->
      @if (state.error()) {
        <p role="alert" style="color: #BE123C; padding: 16px">{{ state.error() }}</p>
      }
      <div class="sticky-footer-action">
        <button class="btn btn-primary btn-block" [disabled]="saving()" (click)="saveAttendance()">
          Guardar asistencia
        </button>
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
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-title {
      font-weight: 700;
      font-size: 1rem;
      color: var(--text-main);
    }

    .content-scroll {
      flex: 1;
      padding: 20px 18px 120px;
    }

    .event-headline {
      margin-bottom: 24px;
    }

    .event-headline h2 {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
      letter-spacing: -0.3px;
    }

    .event-headline p {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 4px;
    }

    .attendance-card {
      background: white;
      border-radius: 20px;
      padding: 18px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 14px;
    }

    .options-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .option-pill {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1.5px solid var(--border-color);
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    }

    .option-pill.selected {
      border-color: var(--primary);
      background: #F5F3FF;
    }

    .option-pill.dinner-pill.selected {
      border-color: #EA580C;
      background: #FFF7ED;
    }

    .option-icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
    }

    .soccer-bullet {
      background: #EEF2FF;
      color: var(--primary);
    }

    .dinner-bullet {
      background: #FFEDD5;
      color: #EA580C;
    }

    .cross-bullet {
      background: #F1F5F9;
      color: var(--text-muted);
    }

    .option-text {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-main);
      flex: 1;
    }

    .check-mark {
      color: var(--primary);
      display: flex;
      align-items: center;
    }

    .check-mark.dinner-mark {
      color: #EA580C;
    }

    .check-mark.cross-mark {
      color: var(--text-muted);
    }

    .btn-block {
      width: 100%;
      padding: 16px;
      font-size: 1rem;
    }
  `]
})
export class AttendanceComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  myId = this.state.currentUser().id;
  currentAttendance = this.state.currentEvent().attendances[this.myId];

  playsSoccer = signal<boolean>(this.currentAttendance?.playsSoccer ?? true);
  attendsDinner = signal<boolean>(this.currentAttendance?.attendsDinner ?? true);

  goBack() {
    this.router.navigate(['/']);
  }

  saving = signal(false);

  async saveAttendance() {
    if (this.saving()) return;
    this.saving.set(true);
    const saved = await this.state.updateMyAttendance(this.playsSoccer(), this.attendsDinner());
    this.saving.set(false);
    if (saved) this.router.navigate(['/partido/confirmados']);
  }
}
