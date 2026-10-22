import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { ProfileService } from './profile.service';
import { PushNotificationsService } from './push-notifications.service';

/** Email that gets the admin role */
const ADMIN_EMAIL = 'gon.herrera.dev@gmail.com';

export interface AppUser {
  id: string;         // Supabase auth UID
  email: string;
  name: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private sb = inject(SupabaseService).client;
  private router = inject(Router);
  private profiles = inject(ProfileService);
  private push = inject(PushNotificationsService);

  // ─── Reactive state ────────────────────────────────────────────────────────

  /** Raw Supabase session — null while loading or logged-out */
  readonly session = signal<Session | null>(null);

  /** Whether we've finished the initial session check */
  readonly initialized = signal(false);

  /** Derived AppUser from the current session */
  readonly currentUser = computed<AppUser | null>(() => {
    const s = this.session();
    if (!s?.user) return null;
    return this.mapUser(s.user);
  });

  readonly isLoggedIn  = computed(() => !!this.session());
  readonly isAdmin     = computed(() => this.currentUser()?.isAdmin ?? false);

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  constructor() {
    // 1. Restore session from localStorage on boot
    this.sb.auth.getSession().then(({ data }) => {
      this.acceptSession(data.session);
      this.initialized.set(true);
    });

    // 2. Keep session signal in sync with any future changes
    this.sb.auth.onAuthStateChange((_event, session) => {
      this.acceptSession(session);
      this.initialized.set(true);
    });
  }

  private acceptSession(session: Session | null) {
    this.profiles.activate(session?.user.id ?? '');
    this.session.set(session);
    // Do not await a Supabase query inside onAuthStateChange's auth lock.
    if (session) setTimeout(() => { void this.profiles.load(); }, 0);
  }

  // ─── Auth methods ───────────────────────────────────────────────────────────

  /**
   * Google OAuth — redirects the browser to Google's consent screen.
   * Supabase will redirect back to /auth/callback after login.
   */
  async signInWithGoogle(): Promise<void> {
    await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  /**
   * Magic Link — sends an email to the given address.
   * Returns an error string on failure, null on success.
   */
  async signInWithMagicLink(email: string): Promise<string | null> {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return error ? error.message : null;
  }

  /** Sign out and go back to /login */
  async signOut(): Promise<void> {
    await this.push.detachForSignOut().catch(() => undefined);
    await this.sb.auth.signOut();
    this.router.navigate(['/login']);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private mapUser(user: User): AppUser {
    const meta = user.user_metadata ?? {};
    const profile = this.profiles.profiles()[user.id];
    return {
      id: user.id,
      email: user.email ?? '',
      name: profile?.display_name ?? meta['full_name'] ?? meta['name'] ?? user.email?.split('@')[0] ?? 'Usuario',
      avatarUrl: this.profiles.avatar(profile, meta['avatar_url'] ?? meta['picture'] ?? ''),
      isAdmin: user.email === ADMIN_EMAIL,
    };
  }
}
