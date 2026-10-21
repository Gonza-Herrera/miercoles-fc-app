export interface Player {
  id: string;
  name: string;
  nickname?: string;
  avatar: string;
  role?: 'ARQ' | 'DEF' | 'MED' | 'DEL';
  preferredFoot?: 'derecho' | 'izquierdo';
  level?: number; // 1 to 5
}

export type AttendanceStatus = 'juega_y_cena' | 'solo_juega' | 'solo_cena' | 'no_asiste';

export interface EventAttendance {
  playerId: string;
  playsSoccer: boolean;
  attendsDinner: boolean;
  confirmedAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  icon: string;
  amount: number;
  buyerPlayerId?: string; // Encargado opcional por ítem particular
}

export interface Team {
  id: string;
  name: string; // e.g. "Equipo A", "Equipo B", "Equipo C", "Equipo D"
  playerIds: string[];
}

export interface MatchTeams {
  teams: Team[];
}

export type PaymentKind = 'pitch' | 'dinner';
export interface PaymentRecord {
  id: string;
  event_id: string;
  kind: PaymentKind;
  player_id: string;
  amount: number;
  recorded_at: string;
  recorded_by: string;
  voided_at: string | null;
  voided_by: string | null;
}

export interface SoccerEvent {
  id: string;
  title: string; // e.g. "Miércoles 24 de septiembre"
  date: string;  // e.g. "2026-09-24"
  time: string;  // e.g. "21:00"
  location: string; // e.g. "La Canchita"
  pitchPrice: number; // e.g. 50000
  dinnerTitle: string; // e.g. "Asado"
  dinnerShopperPlayerId?: string; // Encargado general de hacer las compras de la cena
  status: 'open' | 'playing' | 'dinner' | 'completed';
  
  // Attendance confirmations (initial registration)
  attendances: Record<string, EventAttendance>;
  
  // Teams formation (soporta 2, 3 o 4 equipos dinámicos)
  teams?: MatchTeams;
  matchClosedAt?: string;
  dinnerClosedAt?: string;
  playerRoles?: Record<string, Player['role']>;
  
  // Match execution / closure
  matchPlayedPlayerIds: string[]; // Who actually played on the pitch (default checked)
  matchPaidPlayerIds: string[];   // Who paid pitch share
  
  // Dinner execution / closure
  menuItems: MenuItem[];
  dinnerAttendedPlayerIds: string[]; // Who actually came to dinner
  dinnerPaidPlayerIds: string[];     // Who paid dinner share
}
