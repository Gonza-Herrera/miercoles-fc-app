import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Landing page after Google OAuth or Magic Link redirect.
 * Supabase SDK automatically exchanges the URL hash/code for a session.
 * We just wait for the session signal to be populated and then redirect.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div class="callback-shell">
      <div class="spinner-ring"></div>
      <p class="callback-text">Iniciando sesión…</p>
    </div>
  `,
  styles: [`
    .callback-shell {
      min-height: 100vh;
      background: linear-gradient(145deg, #0F0C29 0%, #1E1B4B 45%, #312E81 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }

    .spinner-ring {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #818CF8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .callback-text {
      color: rgba(255,255,255,0.7);
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
    }
  `]
})
export class AuthCallbackComponent implements OnInit {
  private auth   = inject(AuthService);
  private router = inject(Router);

  async ngOnInit() {
    // Give Supabase SDK a moment to exchange the token from the URL
    // onAuthStateChange in AuthService will update the session signal automatically.
    // We poll briefly then redirect.
    await this.waitForSession();
    const user = this.auth.currentUser();
    if (user) {
      this.router.navigate(['/'], { replaceUrl: true });
    } else {
      // Session exchange failed — back to login
      this.router.navigate(['/login'], { replaceUrl: true });
    }
  }

  private waitForSession(maxWaitMs = 5000): Promise<void> {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.auth.initialized()) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      // Failsafe
      setTimeout(() => { clearInterval(interval); resolve(); }, maxWaitMs);
    });
  }
}
