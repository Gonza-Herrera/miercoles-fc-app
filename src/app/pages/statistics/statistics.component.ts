import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StatisticsService } from '../../services/statistics.service';
import { calculateStatistics, selectStatisticsHistory, StatisticsPeriod } from '../../utils/event-statistics';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, RouterLink],
  providers: [StatisticsService],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css'
})
export class StatisticsComponent {
  readonly data = inject(StatisticsService);
  readonly auth = inject(AuthService);
  readonly period = signal<StatisticsPeriod>('month');
  readonly rankingBy = signal<'matches' | 'dinners'>('matches');
  readonly sportsRankingBy = signal<'wins' | 'goals' | 'assists' | 'mvps'>('goals');
  readonly sportsMetrics = [
    { value: 'goals', label: '⚽ Goles' }, { value: 'assists', label: '👟 Asistencias' },
    { value: 'wins', label: '🏆 Victorias' }, { value: 'mvps', label: '⭐ Figura' }
  ] as const;
  readonly periods: { value: StatisticsPeriod; label: string }[] = [
    { value: 'month', label: 'Este mes' }, { value: 'year', label: 'Este año' }, { value: 'all', label: 'Todo' }
  ];
  readonly statistics = computed(() => calculateStatistics(this.data.history(), this.period()));
  readonly me = computed(() => this.statistics().players.find(p => p.id === this.auth.currentUser()?.id));
  readonly sportsMe = computed(() => this.statistics().sports.players.find(p => p.id === this.auth.currentUser()?.id));
  readonly sportsPlayers = computed(() => [...this.statistics().sports.players]
    .sort((a, b) => b.wins - a.wins || b.draws - a.draws || a.name.localeCompare(b.name, 'es')));
  readonly sportsRanking = computed(() => {
    const metric = this.sportsRankingBy();
    const players = this.statistics().sports.players.filter(p => p[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    return players.map(player => ({ ...player, count: player[metric],
      rank: players.findIndex(p => p[metric] === player[metric]) + 1 }));
  });
  readonly closedEvents = computed(() => selectStatisticsHistory(this.data.history(), this.period())
    .filter(row => ['dinner', 'completed'].includes(row.data.status)).reverse());
  readonly ranking = computed(() => {
    const metric = this.rankingBy();
    const players = this.statistics().players.filter(p => p[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    return players.map(player => ({ ...player,
      count: player[metric], rank: players.findIndex(p => p[metric] === player[metric]) + 1
    }));
  });

  constructor() { void this.data.load(); }

  monthLabel(month: string) {
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
      .format(new Date(`${month}-01T12:00:00`));
  }
}
