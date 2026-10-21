import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-shell">

      <!-- Background decorative blobs -->
      <div class="bg-blob blob-1"></div>
      <div class="bg-blob blob-2"></div>
      <div class="bg-blob blob-3"></div>

      <div class="login-card animate-fade-in">

        <!-- Logo & Brand -->
        <div class="brand-section">
          <div class="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m4.93 4.93 4.24 4.24"></path>
              <path d="m14.83 9.17 4.24-4.24"></path>
              <path d="m14.83 14.83 4.24 4.24"></path>
              <path d="m9.17 14.83-4.24 4.24"></path>
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
          </div>
          <div class="brand-text">
            <h1 class="brand-name">Miércoles FC</h1>
            <p class="brand-tagline">La organización del grupo</p>
          </div>
        </div>

        <!-- Welcome copy -->
        <div class="welcome-block">
          <h2 class="welcome-title">¡Bienvenido! 👋</h2>
          <p class="welcome-sub">
            Ingresá para confirmar tu asistencia al próximo miércoles
          </p>
        </div>

        <!-- Google Sign-In button -->
        <button
          class="btn-google"
          id="btn-login-google"
          (click)="onGoogleLogin()"
          [class.loading]="loadingGoogle()"
          [disabled]="loadingGoogle() || loadingMagic()"
        >
          @if (loadingGoogle()) {
            <span class="spinner"></span>
            <span>Conectando...</span>
          } @else {
            <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continuar con Google</span>
          }
        </button>

        <!-- Divider -->
        <div class="divider">
          <span>o ingresá con tu email</span>
        </div>

        <!-- Magic Link form -->
        @if (!magicSent()) {
          <form class="magic-form" (ngSubmit)="onMagicLink()" #magicForm="ngForm">
            <div class="input-group">
              <label for="email-input" class="input-label">Correo electrónico</label>
              <div class="input-wrapper">
                <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input
                  id="email-input"
                  type="email"
                  class="text-input"
                  placeholder="tuemail@ejemplo.com"
                  [(ngModel)]="email"
                  name="email"
                  required
                  email
                  autocomplete="email"
                  [disabled]="loadingMagic() || loadingGoogle()"
                />
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-magic"
              id="btn-login-magic"
              [class.loading]="loadingMagic()"
              [disabled]="!magicForm.valid || loadingMagic() || loadingGoogle()"
            >
              @if (loadingMagic()) {
                <span class="spinner spinner-white"></span>
                <span>Enviando enlace...</span>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>Enviar Magic Link</span>
              }
            </button>
          </form>
        } @else {
          <!-- Success state after magic link sent -->
          <div class="magic-success animate-fade-in">
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <h3 class="success-title">¡Revisá tu correo!</h3>
            <p class="success-body">
              Enviamos un enlace de acceso a<br>
              <strong>{{ email }}</strong>
            </p>
            <button class="btn-resend" (click)="resetMagicForm()">
              Cambiar email o reenviar
            </button>
          </div>
        }

        <!-- Error message -->
        @if (errorMsg()) {
          <div class="error-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {{ errorMsg() }}
          </div>
        }

        <!-- Footer info -->
        <p class="login-footer">
          Al ingresar aceptás las condiciones del grupo 🤝
        </p>

      </div>

      <!-- Event preview pill at bottom -->
      <div class="event-pill animate-fade-in">
        <span class="pill-dot"></span>
        <span>Próximo miércoles · Canchas del Club</span>
      </div>

    </div>
  `,
  styles: [`
    /* ── Shell ── */
    .login-shell {
      min-height: 100vh;
      background: linear-gradient(145deg, #0F0C29 0%, #1E1B4B 45%, #312E81 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px 40px;
      position: relative;
      overflow: hidden;
    }

    /* Decorative blobs */
    .bg-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.18;
      pointer-events: none;
    }

    .blob-1 {
      width: 320px;
      height: 320px;
      background: #4F46E5;
      top: -80px;
      right: -80px;
    }

    .blob-2 {
      width: 260px;
      height: 260px;
      background: #7C3AED;
      bottom: 60px;
      left: -100px;
    }

    .blob-3 {
      width: 180px;
      height: 180px;
      background: #06B6D4;
      top: 40%;
      right: -40px;
    }

    /* ── Card ── */
    .login-card {
      width: 100%;
      max-width: 400px;
      background: rgba(255, 255, 255, 0.97);
      border-radius: 28px;
      padding: 32px 28px 28px;
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.08),
        0 32px 64px -12px rgba(0, 0, 0, 0.55),
        0 0 40px rgba(79, 70, 229, 0.2);
      position: relative;
      z-index: 2;
    }

    /* ── Brand ── */
    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }

    .brand-logo {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
      flex-shrink: 0;
    }

    .brand-logo svg {
      width: 28px;
      height: 28px;
    }

    .brand-name {
      font-family: 'Outfit', sans-serif;
      font-size: 1.45rem;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .brand-tagline {
      font-size: 0.78rem;
      color: #64748B;
      font-weight: 500;
      margin-top: 2px;
    }

    /* ── Welcome ── */
    .welcome-block {
      margin-bottom: 24px;
    }

    .welcome-title {
      font-size: 1.3rem;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 4px;
    }

    .welcome-sub {
      font-size: 0.88rem;
      color: #64748B;
      line-height: 1.5;
    }

    /* ── Google Button ── */
    .btn-google {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 20px;
      background: white;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      font-size: 0.95rem;
      font-weight: 700;
      color: #0F172A;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 20px;
    }

    .btn-google:hover:not(:disabled) {
      border-color: #4285F4;
      box-shadow: 0 4px 16px rgba(66, 133, 244, 0.18);
      transform: translateY(-1px);
    }

    .btn-google:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn-google:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .google-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* ── Divider ── */
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      color: #94A3B8;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #E2E8F0;
    }

    /* ── Magic Link form ── */
    .magic-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .input-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      color: #374151;
      margin-bottom: 6px;
      letter-spacing: 0.1px;
    }

    .input-wrapper {
      position: relative;
    }

    .input-icon {
      position: absolute;
      left: 13px;
      top: 50%;
      transform: translateY(-50%);
      width: 17px;
      height: 17px;
      color: #94A3B8;
      pointer-events: none;
    }

    .text-input {
      width: 100%;
      padding: 13px 14px 13px 40px;
      border: 1.5px solid #E2E8F0;
      border-radius: 12px;
      font-size: 0.95rem;
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #0F172A;
      background: #F8FAFC;
      transition: all 0.2s ease;
      outline: none;
    }

    .text-input:focus {
      border-color: #4F46E5;
      background: white;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
    }

    .text-input::placeholder {
      color: #CBD5E1;
    }

    .text-input:disabled {
      opacity: 0.6;
    }

    /* ── Magic Link send button ── */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 20px;
      font-size: 0.95rem;
      font-weight: 700;
      border-radius: 14px;
      border: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .btn-magic {
      width: 100%;
      background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
      color: white;
      box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
    }

    .btn-magic:hover:not(:disabled) {
      box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
      transform: translateY(-1px);
    }

    .btn-magic:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
    }

    .btn-magic:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* ── Spinners ── */
    .spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid #E2E8F0;
      border-top-color: #4F46E5;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }

    .spinner-white {
      border-color: rgba(255,255,255,0.3);
      border-top-color: white;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ── Magic Link success state ── */
    .magic-success {
      text-align: center;
      padding: 8px 0 4px;
    }

    .success-icon {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #EEF2FF, #DDD6FE);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 14px;
      color: #4F46E5;
    }

    .success-icon svg {
      width: 26px;
      height: 26px;
    }

    .success-title {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 8px;
    }

    .success-body {
      font-size: 0.88rem;
      color: #64748B;
      line-height: 1.6;
    }

    .success-body strong {
      color: #4F46E5;
      font-weight: 700;
    }

    .btn-resend {
      margin-top: 16px;
      background: none;
      border: none;
      color: #4F46E5;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    /* ── Footer note ── */
    /* ── Error banner ── */
    .error-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #FFF1F2;
      border: 1px solid #FECDD3;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 0.83rem;
      color: #BE123C;
      font-weight: 600;
      margin-top: 4px;
    }

    .login-footer {
      text-align: center;
      font-size: 0.76rem;
      color: #94A3B8;
      margin-top: 22px;
      line-height: 1.5;
    }

    /* ── Bottom event pill ── */
    .event-pill {
      margin-top: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 8px 18px;
      border-radius: 99px;
      color: rgba(255,255,255,0.8);
      font-size: 0.8rem;
      font-weight: 600;
      z-index: 2;
    }

    .pill-dot {
      width: 8px;
      height: 8px;
      background: #10B981;
      border-radius: 50%;
      box-shadow: 0 0 6px #10B981;
      flex-shrink: 0;
      animation: pulse-dot 2s infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.85); }
    }

    /* Fade-in */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .animate-fade-in {
      animation: fadeIn 0.35s ease-out forwards;
    }

    /* Loading modifier */
    .loading {
      pointer-events: none;
    }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);

  email = '';
  loadingGoogle = signal(false);
  loadingMagic  = signal(false);
  magicSent     = signal(false);
  errorMsg      = signal<string | null>(null);

  async onGoogleLogin(): Promise<void> {
    this.errorMsg.set(null);
    this.loadingGoogle.set(true);
    try {
      await this.auth.signInWithGoogle();
      // Browser will redirect to Google — no further action needed here
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Error al iniciar sesión con Google');
      this.loadingGoogle.set(false);
    }
  }

  async onMagicLink(): Promise<void> {
    if (!this.email) return;
    this.errorMsg.set(null);
    this.loadingMagic.set(true);
    const err = await this.auth.signInWithMagicLink(this.email);
    this.loadingMagic.set(false);
    if (err) {
      this.errorMsg.set(err);
    } else {
      this.magicSent.set(true);
    }
  }

  resetMagicForm(): void {
    this.magicSent.set(false);
    this.errorMsg.set(null);
    this.email = '';
  }
}
