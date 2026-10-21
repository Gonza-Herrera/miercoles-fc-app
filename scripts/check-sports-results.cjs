const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const clone = value => structuredClone(value);
function load(path, imports = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText;
  vm.runInNewContext(js, { exports, require: id => imports[id] ?? {},
    AbortController, AbortSignal, setTimeout, clearTimeout, structuredClone, crypto });
  return exports;
}
const utils = load('src/app/utils/sports-statistics.ts');
const event = { id: crypto.randomUUID(), data: {
  status: 'completed', matchPlayedPlayerIds: ['a', 'b'],
  teams: { teams: [{ id: 'A', playerIds: ['a'] }, { id: 'B', playerIds: ['b'] }] }
}, event_rsvps: [] };
const result = { fixtures: [{ id: crypto.randomUUID(), homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0,
  players: [{ playerId: 'a', goals: 1, assists: 0 }], mvpPlayerId: 'a' }] };
let admin = true, network = 'ok', server = null, calls = 0;
const client = {
  from: () => {
    const q = { select: () => q, eq: () => q, returns: () => q, abortSignal: () => q,
      maybeSingle: async () => network === 'offline' ? { error: new Error('Offline') } : { data: { ...clone(event), event_sports: clone(server) } }
    }; return q;
  },
  rpc: (name, args) => {
    assert.equal(name, 'save_event_sports'); calls++;
    return { abortSignal: async () => {
      if (network === 'offline') return { error: new Error('Offline') };
      if (server?.last_operation !== args.p_operation) {
        if ((server?.version ?? -1) !== args.p_version) return { error: { code: '40001' } };
        server = { event_id: event.id, version: (server?.version ?? -1) + 1, data: clone(args.p_data), last_operation: args.p_operation };
      }
      if (network === 'lost-response') { network = 'ok'; return { error: new Error('Response lost') }; }
      return { data: [clone(server)] };
    } };
  }
};
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
const { SportsResultsService } = load('src/app/services/sports-results.service.ts', {
  '@angular/core': { Injectable: () => target => target, signal, DestroyRef: 'destroy',
    inject: token => token === 'destroy' ? { onDestroy() {} } : token === 'auth' ? { isAdmin: () => admin } : { client } },
  './supabase.service': { SupabaseService: 'supabase' }, './auth.service': { AuthService: 'auth' },
  '../utils/sports-statistics': utils
});
(async () => {
  const sessionA = new SportsResultsService();
  const sessionB = new SportsResultsService();
  assert.equal(await sessionA.load(event.id), true);
  assert.equal(await sessionB.load(event.id), true);
  admin = false;
  assert.equal(await sessionA.save(result), false);
  assert.equal(calls, 0);
  admin = true; network = 'offline';
  assert.equal(await sessionA.save(result), false);
  assert.equal(sessionA.record(), null);
  assert.equal(sessionA.canRetry(), true);
  network = 'ok';
  assert.equal(await sessionA.retry(), true);
  assert.equal(server.version, 0);
  assert.equal(sessionA.record().version, 0);
  assert.equal(await sessionB.save(result), false);
  assert.equal(sessionB.conflict(), true);
  assert.equal(await sessionB.save(result), false);
  assert.equal(await sessionB.load(event.id), true);
  assert.equal(sessionB.conflict(), false);
  assert.equal(sessionB.record().version, 0);
  const correction = clone(result); correction.fixtures[0].homeScore = 2;
  network = 'lost-response';
  assert.equal(await sessionA.save(correction), false);
  assert.equal(server.version, 1);
  assert.equal(sessionA.record().version, 0); // Confirmed UI stays unchanged after uncertain response.
  correction.fixtures[0].homeScore = 99; // A draft mutation cannot change the pending retry.
  assert.equal(await sessionA.save(correction), false);
  assert.equal(await sessionA.retry(), true);
  assert.equal(server.version, 1); // Same operation returns the stored result, without a second write.
  assert.equal(sessionA.record().data.fixtures[0].homeScore, 2);
  assert.equal(sessionA.canRetry(), false);
  assert.equal(await sessionA.save({ fixtures: [] }), true); // Removing a result removes it from future aggregates.
  assert.equal(server.data.fixtures.length, 0);
  const previousCalls = calls;
  event.data.status = 'open'; await sessionB.load(event.id);
  assert.equal(await sessionB.save(result), false);
  assert.equal(calls, previousCalls);
  console.log('Resultados deportivos: permisos, cierres, dos sesiones, conflictos, conexión, reintentos y respuestas perdidas verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
