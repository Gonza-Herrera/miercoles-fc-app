const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(path, imports = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => imports[name] ?? {},
    Date, Map, Set, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}
const { calculateStatistics } = loadModule('src/app/utils/event-statistics.ts');
const today = new Date(2026, 9, 21);
const event = (id, date, status, played, ate, pitchPrice = 100, amounts = [20]) => ({
  id, data: { date, status, pitchPrice, matchPlayedPlayerIds: played,
    dinnerAttendedPlayerIds: ate, menuItems: amounts.map(amount => ({ amount })),
    attendances: { absent: { playsSoccer: true, attendsDinner: true } } },
  event_rsvps: ['a', 'b', 'absent'].map(id => ({ player_id: id, player: { name: id.toUpperCase() } }))
});
const history = [
  event('old', '2025-10-01', 'completed', ['a'], ['a']),
  event('september', '2026-09-30', 'completed', ['a'], ['b']),
  event('finished', '2026-10-07', 'completed', ['a', 'a', 'b'], ['a'], 100, [10.01, 20.02]),
  event('dinner-open', '2026-10-14', 'dinner', ['a'], ['b'], 80, [999]),
  event('open', '2026-10-21', 'open', ['a'], ['a'], 999),
  event('playing', '2026-10-22', 'playing', ['a'], ['a'], 999),
  event('empty', '2026-10-28', 'completed', [], [], 999)
];
const month = calculateStatistics(history, 'month', today);
assert.equal(month.matches, 2);
assert.equal(month.dinners, 1);
assert.equal(month.matchAttendances, 3); // Duplicate IDs counted once per event.
assert.equal(month.averagePlayers, 1.5);
assert.equal(month.averagePitchCost, 60); // Weighted by actual presences.
assert.equal(month.totalDinnerCost, 30.03); // Sum money in cents.
assert.equal(month.averageDinnerCost, 30.03);
assert.equal(month.players.find(p => p.id === 'a').matches, 2);
assert.equal(month.players.find(p => p.id === 'a').participations, 2); // Playing + dining is one date.
assert.equal(month.players.find(p => p.id === 'b').dinners, 0); // Draft dinner attendance excluded.
assert.equal(month.players.some(p => p.id === 'absent'), false); // RSVP isn't real attendance.
assert.equal(month.months[0].players, 3);
assert.equal(calculateStatistics(history, 'year', today).matches, 3);
assert.equal(calculateStatistics(history, 'all', today).matches, 4);
const empty = calculateStatistics([], 'month', today);
assert.equal(empty.averagePlayers, null);
assert.equal(empty.averageDinnerCost, null);
assert.equal(empty.players.length, 0);
assert.equal(calculateStatistics([event('midnight', '2026-10-01', 'completed', ['a'], [])], 'month', today).matches, 1);

let fail = false;
const ranges = [];
const pages = Array.from({ length: 201 }, (_, i) => event(String(i), '2026-10-01', 'completed', ['a'], []));
const client = { from: table => {
  assert.equal(table, 'event_records');
  let start = 0, end = 0;
  const q = { select: () => q, order: () => q,
    range: (a, b) => { start = a; end = b; ranges.push([a, b]); return q; },
    abortSignal: async () => fail ? { error: new Error('Offline') } : { data: pages.slice(start, end + 1) }
  };
  return q;
} };
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
const { StatisticsService } = loadModule('src/app/services/statistics.service.ts', {
  '@angular/core': { Injectable: () => value => value, signal,
    inject: token => token === 'destroy' ? { onDestroy() {} } : { client }, DestroyRef: 'destroy' },
  './supabase.service': { SupabaseService: 'supabase' }
});
(async () => {
  const service = new StatisticsService();
  await service.load();
  assert.equal(service.history().length, 201);
  assert.deepEqual(ranges, [[0, 199], [200, 399]]);
  assert.equal(service.error(), null);
  assert.equal(service.loading(), false);
  fail = true;
  await service.load();
  assert.equal(service.history().length, 0); // Never display partial or stale totals after failure.
  assert.ok(service.error());
  fail = false;
  await service.load();
  assert.equal(service.error(), null);
  assert.equal(service.history().length, 201);
  console.log('Estadísticas: períodos, cierres, presencias, costos, paginación y recuperación verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
