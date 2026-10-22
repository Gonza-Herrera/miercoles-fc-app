const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const clone = value => structuredClone(value);
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
let userId = 'a', isAdmin = false, network = 'ok', requests = 0;
let poll = { event_id: 'event', fixture_id: 'fixture', eligible_player_ids: ['a', 'b', 'c'], closed_at: null, winner_player_ids: [], vote_count: null };
const votes = new Map();
const auth = { currentUser: () => ({ id: userId }), isAdmin: () => isAdmin };
const client = {
  from: table => {
    const q = { select: () => q, eq: () => q, abortSignal: () => q,
      maybeSingle: async () => network === 'offline' ? { error: new Error('Offline') } : { data: clone(table === 'fixture_polls' ? poll : votes.get(userId) ?? null) }
    }; return q;
  },
  rpc: (name, args) => ({ abortSignal: async () => {
    requests++;
    if (network === 'offline') return { error: new Error('Offline') };
    let data;
    if (name === 'cast_fixture_vote') {
      const old = votes.get(userId);
      if (old?.last_operation === args.p_operation) data = old;
      else {
        if (poll.closed_at) return { error: { code: 'P0001', message: 'La votación ya está cerrada.' } };
        if ((old?.version ?? -1) !== args.p_version) return { error: { code: '40001' } };
        data = { voter_id: userId, candidate_id: args.p_candidate_id, last_operation: args.p_operation, version: (old?.version ?? -1) + 1 };
        votes.set(userId, clone(data));
      }
    } else {
      assert.equal(name, 'close_fixture_poll');
      poll = { ...poll, closed_at: '2026-10-22T03:00:00Z', winner_player_ids: ['b'], vote_count: votes.size }; data = poll;
    }
    if (network === 'lost-response') { network = 'ok'; return { error: new Error('Lost response') }; }
    return { data: [clone(data)] };
  } })
};
const imports = { '@angular/core': { signal, Injectable: () => target => target, DestroyRef: 'destroy',
  inject: token => token === 'destroy' ? { onDestroy() {} } : token === 'auth' ? auth : { client } },
  './supabase.service': { SupabaseService: 'supabase' }, './auth.service': { AuthService: 'auth' } };
const exportsObject = {};
const js = ts.transpileModule(fs.readFileSync('src/app/services/fixture-voting.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
}).outputText;
vm.runInNewContext(js, { exports: exportsObject, require: name => imports[name] ?? {}, crypto, AbortController, AbortSignal, setTimeout, clearTimeout });
const { FixtureVotingService } = exportsObject;
(async () => {
  const service = new FixtureVotingService(), otherSession = new FixtureVotingService();
  assert.equal(await service.load('event', 'fixture'), true);
  await otherSession.load('event', 'fixture');
  assert.equal(await service.cast('a'), false);
  assert.equal(await service.cast('outside'), false);
  assert.equal(await service.close(), false);
  assert.equal(requests, 0);
  network = 'offline';
  assert.equal(await service.cast('b'), false);
  assert.equal(service.vote(), null); assert.equal(service.canRetry(), true);
  network = 'ok';
  assert.equal(await service.retry(), true);
  assert.equal(service.vote().candidate_id, 'b');
  assert.equal(votes.size, 1);
  assert.equal(await otherSession.cast('c'), false); assert.equal(otherSession.conflict(), true);
  await otherSession.load('event', 'fixture');
  assert.equal(otherSession.conflict(), false);
  network = 'lost-response';
  assert.equal(await service.cast('c'), false);
  assert.equal(service.vote().candidate_id, 'b'); // No optimistic confirmation.
  assert.equal(votes.get('a').candidate_id, 'c');
  assert.equal(await service.cast('b'), false); // Uncertain send must be resolved first.
  assert.equal(await service.retry(), true);
  assert.equal(service.vote().version, 1); assert.equal(votes.size, 1);
  userId = 'outside';
  await service.load('event', 'fixture');
  assert.equal(await service.cast('b'), false);
  userId = 'admin'; isAdmin = true;
  await service.load('event', 'fixture');
  network = 'lost-response';
  assert.equal(await service.close(), false);
  assert.equal(service.poll().closed_at, null);
  assert.equal(await service.retry(), true);
  assert.ok(service.poll().closed_at);
  userId = 'a'; isAdmin = false;
  await service.load('event', 'fixture');
  assert.equal(await service.cast('b'), false);
  assert.equal(service.poll().vote_count, 1);
  console.log('Votación: permisos, un voto por persona, cambios, conflictos, fallas de conexión, respuestas perdidas y cierre verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
