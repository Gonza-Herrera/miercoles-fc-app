import { Routes } from '@angular/router';
import { LoginComponent } from './pages/auth/login.component';
import { AuthCallbackComponent } from './pages/auth/auth-callback.component';
import { HomeComponent } from './pages/home/home.component';
import { AttendanceComponent } from './pages/attendance/attendance.component';
import { ConfirmedPlayersComponent } from './pages/match/confirmed-players.component';
import { MakeTeamsComponent } from './pages/match/make-teams.component';
import { TeamsViewComponent } from './pages/match/teams-view.component';
import { MatchAttendanceCheckComponent } from './pages/match/match-attendance-check.component';
import { MatchSummaryComponent } from './pages/match/match-summary.component';
import { PitchPaymentsComponent } from './pages/payments/pitch-payments.component';
import { DinnerMenuComponent } from './pages/dinner/dinner-menu.component';
import { DinnerAttendeesComponent } from './pages/dinner/dinner-attendees.component';
import { DinnerSummaryComponent } from './pages/dinner/dinner-summary.component';
import { DinnerPaymentsComponent } from './pages/payments/dinner-payments.component';
import { TotalSummaryComponent } from './pages/payments/total-summary.component';
import { AdminEventComponent } from './pages/admin/admin-event.component';
import { authGuard, adminGuard, eventGuard, teamEditGuard, registrationGuard } from './guards/auth.guard';

export const routes: Routes = [
  // ── Auth (public) ──────────────────────────────────────────────────────────
  { path: 'login', component: LoginComponent },
  { path: 'auth/callback', component: AuthCallbackComponent },

  // ── Main app (requires login) ───────────────────────────────────────────────
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'inicio', redirectTo: '', pathMatch: 'full' },
  { path: 'estadisticas', loadComponent: () => import('./pages/statistics/statistics.component').then(m => m.StatisticsComponent), canActivate: [authGuard] },

  // Pantalla 2: Asistencia
  { path: 'asistencia', component: AttendanceComponent, canActivate: [authGuard, eventGuard, registrationGuard] },

  // Flujo Partido
  { path: 'partido/confirmados',  component: ConfirmedPlayersComponent,    canActivate: [authGuard, eventGuard] },
  { path: 'partido/armar-equipos', component: MakeTeamsComponent,          canActivate: [adminGuard, eventGuard, teamEditGuard] },
  { path: 'partido/equipos',       component: TeamsViewComponent,          canActivate: [authGuard, eventGuard] },
  { path: 'partido/presentes',     component: MatchAttendanceCheckComponent, canActivate: [adminGuard, eventGuard] },
  { path: 'partido/resumen',       component: MatchSummaryComponent,       canActivate: [authGuard, eventGuard] },

  // Flujo Cena
  { path: 'cena',           redirectTo: 'cena/menu', pathMatch: 'full' },
  { path: 'cena/menu',      component: DinnerMenuComponent,      canActivate: [authGuard, eventGuard] },
  { path: 'cena/asistentes', component: DinnerAttendeesComponent, canActivate: [authGuard, eventGuard] },
  { path: 'cena/resumen',   component: DinnerSummaryComponent,   canActivate: [authGuard, eventGuard] },

  // Flujo Pagos
  { path: 'pagos',               redirectTo: 'pagos/resumen-total', pathMatch: 'full' },
  { path: 'pagos/cancha',        component: PitchPaymentsComponent,  canActivate: [authGuard, eventGuard] },
  { path: 'pagos/cena',          component: DinnerPaymentsComponent, canActivate: [authGuard, eventGuard] },
  { path: 'pagos/resumen-total', component: TotalSummaryComponent,   canActivate: [authGuard, eventGuard] },

  // ── Admin (requires admin role) ────────────────────────────────────────────
  { path: 'admin/editar-evento', component: AdminEventComponent, data: { edit: true }, canActivate: [adminGuard, eventGuard] },
  { path: 'admin/nuevo-evento', component: AdminEventComponent, canActivate: [adminGuard] },

  { path: '**', redirectTo: '' }
];

