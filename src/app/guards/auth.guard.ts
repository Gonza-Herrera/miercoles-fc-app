import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventStateService } from '../services/event-state.service';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes that require the user to be logged in.
 * If not authenticated, redirects to /login.
 */
export const authGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Wait for the initial session check to complete
  await waitForInit(auth);

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/**
 * Protects routes that require the ADMIN role.
 * Redirects non-admin users to the home page.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  await waitForInit(auth);

  if (auth.isAdmin()) {
    return true;
  }

  // Logged in but not admin → go home
  if (auth.isLoggedIn()) {
    return router.createUrlTree(['/']);
  }

  return router.createUrlTree(['/login']);
};

export const eventGuard: CanActivateFn = async () => {
  const state = inject(EventStateService);
  const router = inject(Router);
  const auth = inject(AuthService);
  await waitForInit(auth);
  await state.loadEvent();
  return state.hasEvent() ? true : router.createUrlTree(['/']);
};

export const teamEditGuard: CanActivateFn = async () => {
  const state = inject(EventStateService);
  const router = inject(Router);
  const auth = inject(AuthService);
  await waitForInit(auth);
  await state.loadEvent();
  return state.canEditTeams() ? true : router.createUrlTree(['/partido/equipos']);
};
export const registrationGuard: CanActivateFn = async () => {
  const state = inject(EventStateService);
  const router = inject(Router);
  const auth = inject(AuthService);
  await waitForInit(auth);
  await state.loadEvent();
  return state.currentEvent().status === 'open' ? true : router.createUrlTree(['/']);
};

function waitForInit(auth: AuthService): Promise<void> {
  if (auth.initialized()) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearInterval(interval); clearTimeout(timeout); resolve(); };
    const interval = setInterval(() => { if (auth.initialized()) finish(); }, 50);
    const timeout = setTimeout(finish, 4000);
  });
}
