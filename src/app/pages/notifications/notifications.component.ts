import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PushJob, PushNotificationsService } from '../../services/push-notifications.service';

@Component({
  selector: 'app-notifications', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './notifications.component.html', styleUrl: './notifications.component.css'
})
export class NotificationsComponent {
  readonly push = inject(PushNotificationsService);
  readonly auth = inject(AuthService);
  readonly feedbackVisible = signal(false);
  readonly draft = signal<{ title: string; body: string; path: string } | null>(null);
  readonly locked = computed(() => this.push.sending() || !!this.push.pendingJob());
  title = '';
  body = '';
  path = '/';
  formError = '';
  readonly destinations = [
    { path: '/', label: 'Inicio' }, { path: '/cena/menu', label: 'Menú de la cena' },
    { path: '/partido/equipos', label: 'Equipos' }, { path: '/partido/confirmados', label: 'Confirmados' }
  ];

  constructor() {
    void this.push.load(this.auth.isAdmin());
    effect(onCleanup => {
      const message = this.push.error() || this.push.notice(); this.feedbackVisible.set(!!message);
      if (message) { const timer = setTimeout(() => this.feedbackVisible.set(false), 3000); onCleanup(() => clearTimeout(timer)); }
    });
  }
  preview() {
    this.formError = '';
    if (!this.title.trim() || this.title.trim().length > 100 || !this.body.trim() || this.body.trim().length > 500) {
      this.formError = 'Completá el título (hasta 100 caracteres) y el mensaje (hasta 500).'; return;
    }
    this.draft.set({ title: this.title.trim(), body: this.body.trim(), path: this.path });
  }
  async send() {
    const draft = this.draft();
    if (!this.auth.isAdmin() || !draft) return;
    if (await this.push.send(draft)) { this.draft.set(null); this.title = ''; this.body = ''; }
  }
  async retry() {
    if (await this.push.retry()) this.draft.set(null);
  }
  async resume(job: PushJob) {
    if (this.auth.isAdmin()) await this.push.send(job, job.id);
  }
  destinationLabel(path: string) { return this.destinations.find(item => item.path === path)?.label ?? 'Inicio'; }
  async activate() { await this.push.enable(); if (this.push.active()) await this.push.load(this.auth.isAdmin()); }
  async deactivate() { await this.push.disable(); if (!this.push.active()) await this.push.load(this.auth.isAdmin()); }
}
