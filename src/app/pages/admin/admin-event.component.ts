import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-admin-event-modal',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container animate-fade-in">
      <header class="header-bar">
        <button class="icon-back-btn" (click)="goBack()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <span class="header-title">Crear Nuevo Miércoles</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <div class="form-card">
          <div class="form-group">
            <label>Título del Evento</label>
            <input type="text" [(ngModel)]="title" class="input-control" placeholder="Miércoles 21 de octubre" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Fecha</label>
              <input type="date" [(ngModel)]="date" class="input-control" />
            </div>
            <div class="form-group">
              <label>Hora</label>
              <input type="time" [(ngModel)]="time" class="input-control" />
            </div>
          </div>

          <div class="form-group">
            <label>Lugar de la cancha</label>
            <input type="text" [(ngModel)]="location" class="input-control" placeholder="Sale Futbol" />
          </div>

          <div class="form-group">
            <label>Precio Cancha ($)</label>
            <input type="number" [(ngModel)]="pitchPrice" class="input-control" placeholder="55000" min="1" />
          </div>

        </div>
      </div>

      @if (state.error()) {
        <p class="form-error" role="alert">{{ state.error() }}</p>
      }
      <div class="sticky-footer-action">
        <button class="btn btn-primary btn-block" [disabled]="saving() || !isValid()" (click)="createEvent()">
          {{ saving() ? 'Publicando…' : 'Publicar Miércoles FC' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .form-error { color: #BE123C; padding: 0 20px 16px; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
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
    }

    .header-title {
      font-weight: 700;
      font-size: 1rem;
    }

    .content-scroll {
      flex: 1;
      padding: 20px 18px 40px;
    }

    .form-card {
      background: white;
      border-radius: 20px;
      padding: 20px;
      border: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    @media (max-width: 380px) {
      .form-row {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .input-control {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1.5px solid var(--border-color);
      font-size: 0.95rem;
      font-family: inherit;
    }

    .input-control:focus {
      outline: none;
      border-color: var(--primary);
    }

    .btn-block {
      width: 100%;
      padding: 16px;
      font-size: 1rem;
    }
  `]
})
export class AdminEventComponent {
  state = inject(EventStateService);
  private router = inject(Router);

  title = '';
  date = '';
  time = '';
  location = '';
  pitchPrice: number | null = null;
  saving = signal(false);

  isValid() {
    return !!this.title.trim() && !!this.date && !!this.time && !!this.location.trim() &&
      this.pitchPrice !== null && Number.isFinite(this.pitchPrice) && this.pitchPrice > 0;
  }

  goBack() {
    this.router.navigate(['/']);
  }

  async createEvent() {
    if (this.saving() || !this.isValid()) return;
    this.saving.set(true);
    const created = await this.state.createNewEvent({
      title: this.title,
      date: this.date,
      time: this.time,
      location: this.location,
      pitchPrice: this.pitchPrice!
    });
    this.saving.set(false);
    if (created) this.router.navigate(['/']);
  }
}
