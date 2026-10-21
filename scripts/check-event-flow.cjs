const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const clone = value => JSON.parse(JSON.stringify(value));
const database = { event_records: [], event_rsvps: [], event_payments: [] };
let network = 'ok', currentAuth;
const failure = () => ({ data: null, error: new Error('Offline') });
function query(table) {
  let operation = 'select', payload;
  const filters = [];
  const q = {
    abortSignal: () => q, select: () => q, order: () => q, limit: () => q,
    eq: (key, value) => { filters.push(row => row[key] === value); return q; },
    insert: data => { operation = 'insert'; payload = clone(data); return q; },
    upsert: data => { operation = 'upsert'; payload = clone(data); return q; },
    maybeSingle: () => run(true), single: () => run(true),
    then: (resolve, reject) => run(false).then(resolve, reject)
  };
  async function run(single) {
    if (network === 'offline') return failure();
    if (operation === 'insert') {
      if (database[table].some(r => r.id === payload.id)) return { data: null, error: { code: '23505' } };
      database[table].unshift({ version: 0, ...payload });
    }
    if (operation === 'upsert') {
      const index = database[table].findIndex(r => r.event_id === payload.event_id && r.player_id === payload.player_id);
      if (index < 0) database[table].push(payload); else database[table][index] = payload;
    }
    const rows = database[table].filter(r => filters.every(fn => fn(r)));
    const result = { data: clone(single ? rows[0] ?? null : rows), error: null };
    if (operation !== 'select' && network === 'lost-response') { network = 'ok'; return failure(); }
    return result;
  }
  return q;
}
async function rpc(name, args) {
  if (network === 'offline') return failure();
  const row = database.event_records.find(r => r.id === args.p_event_id);
  let result;
  if (name === 'save_event') {
    if (row.last_operation !== args.p_operation) {
      if (row.version !== args.p_version) return { data: null, error: { code: '40001', message: 'Conflict' } };
      row.data = clone(args.p_data); row.version++; row.last_operation = args.p_operation;
    }
    result = { data: [clone(row)], error: null };
  } else {
    const payments = database.event_payments;
    const replay = payments.some(p => p.id === args.p_operation || p.void_operation === args.p_operation);
    const active = payments.find(p => p.event_id === row.id && p.kind === args.p_kind && p.player_id === args.p_player_id && !p.voided_at);
    if (!replay && args.p_paid && !active) {
      const ids = [...row.data[args.p_kind === 'pitch' ? 'matchPlayedPlayerIds' : 'dinnerAttendedPlayerIds']].sort();
      const total = args.p_kind === 'pitch' ? row.data.pitchPrice : row.data.menuItems.reduce((sum,p) => sum + p.amount, 0);
      const cents = Math.round(total * 100);
      const amount = (Math.floor(cents/ids.length) + (ids.indexOf(args.p_player_id) < cents%ids.length ? 1 : 0))/100;
      payments.push({ id: args.p_operation, event_id: row.id, kind: args.p_kind, player_id: args.p_player_id, amount, recorded_by: 'admin', recorded_at: new Date().toISOString(), voided_at: null, voided_by: null });
    } else if (!replay && !args.p_paid && active) {
      if (active.id !== args.p_payment_id) return { data: null, error: { code: '40001' } };
      active.voided_at = new Date().toISOString(); active.voided_by = 'admin'; active.void_operation = args.p_operation;
    }
    result = { data: clone(payments.filter(p => p.event_id === row.id)), error: null };
  }
  if (network === 'lost-response') { network = 'ok'; return failure(); }
  return result;
}
const signal = initial => {
  let value = initial;
  const read = () => value;
  read.set = next => value = next;
  read.update = fn => value = fn(value);
  return read;
};
class SupabaseService {}
class AuthService {}
const angular = {
  Injectable: () => target => target, signal, computed: fn => fn, effect: () => {}, untracked: fn => fn(), DestroyRef: class {},
  inject: token => token === SupabaseService ? { client: { from: query, rpc: (...args) => { const promise = rpc(...args); promise.abortSignal = () => promise; return promise; } } } : token === AuthService ? currentAuth : { onDestroy() {} }
};
const source = ts.transpileModule(fs.readFileSync('src/app/services/event-state.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
}).outputText;
const context = { exports: {}, require: name => name === '@angular/core' ? angular : { SupabaseService, AuthService }, window: { addEventListener() {}, removeEventListener() {} }, setInterval() {}, clearInterval() {}, Date, Math, AbortSignal, crypto: { randomUUID } };
vm.runInNewContext(source, context);
function session(id, admin) {
  currentAuth = { isAdmin: () => admin, currentUser: () => ({ id, name: id, avatarUrl: '' }), isLoggedIn: () => true };
  return new context.exports.EventStateService();
}
(async () => {
  const admin = session('admin', true), otherAdmin = session('admin', true), player = session('player', false);
  await player.loadEvent();
  assert.equal(player.hasEvent(), false);
  assert.equal(await player.updateMyAttendance(true, true), false);
  const input = { title: 'Miércoles', date: '2026-10-21', time: '22:00', location: 'Sale Futbol', pitchPrice: 55000.01 };
  assert.equal(await player.createNewEvent(input), false);
  assert.equal(await admin.createNewEvent({ ...input, pitchPrice: 0 }), false);
  network = 'lost-response';
  assert.equal(await admin.createNewEvent(input), false);
  assert.equal(admin.hasEvent(), false, 'Creation must not appear confirmed without response');
  assert.equal(await admin.retryLastSave(), true);
  assert.equal(database.event_records.length, 1, 'Creation retry must not duplicate event');
  assert.equal(admin.soccerConfirmedCount(), 0);
  assert.equal(admin.currentEvent().menuItems.length, 0);
  await otherAdmin.loadEvent();
  await player.loadEvent();
  assert.equal(await player.updateMyAttendance(true, true), true);
  await admin.updateMyAttendance(true, true);
  await admin.loadEvent();
  const prior = JSON.stringify(admin.currentEvent());
  network = 'offline';
  const saving = admin.updateDinnerTitle('Offline title');
  assert.equal(admin.saving(), true);
  assert.equal(await saving, false);
  assert.equal(JSON.stringify(admin.currentEvent()), prior, 'Failure must not mutate confirmed state');
  assert.equal(admin.canRetry(), true);
  network = 'ok';
  assert.equal(await admin.retryLastSave(), true);
  assert.equal(admin.currentEvent().dinnerTitle, 'Offline title');
  assert.equal(await otherAdmin.updateDinnerTitle('Stale write'), false);
  assert.equal(otherAdmin.canRetry(), false, 'Conflicts require refresh, not blind retry');
  assert.equal(database.event_records[0].data.dinnerTitle, 'Offline title');
  await otherAdmin.refreshAfterError();
  assert.equal(otherAdmin.currentEvent().dinnerTitle, 'Offline title');
  await admin.loadEvent();
  await otherAdmin.loadEvent();
  const simultaneous = await Promise.all([
    admin.updateDinnerTitle('Concurrent A'), otherAdmin.updateDinnerTitle('Concurrent B')
  ]);
  assert.equal(simultaneous.filter(Boolean).length, 1, 'Exactly one stale-version concurrent save succeeds');
  await admin.refreshAfterError();
  const beforePlayer = JSON.stringify(player.currentEvent());
  assert.equal(await player.updateDinnerTitle('Forbidden'), false);
  assert.equal(await player.setPayment('pitch', 'player', true), false);
  assert.equal(JSON.stringify(player.currentEvent()), beforePlayer);
  assert.equal(await admin.addMenuItem('Comida', 100.01), true);
  assert.equal(admin.dinnerPreviewCostPerPerson(), 50);
  assert.equal(await admin.setPayment('pitch', 'player', true), false, 'No cobros before closing');
  assert.equal(await admin.startMatch(), true);
  assert.equal(await admin.confirmMatch(['admin','player']), true);
  assert.equal(admin.matchClosed(), true);
  assert.equal(Math.round((admin.shareFor('pitch','admin')+admin.shareFor('pitch','player'))*100),5500001);
  network = 'lost-response';
  assert.equal(await admin.setPayment('pitch', 'player', true), false);
  assert.equal(admin.matchPaidCount(), 0, 'Lost response must not show a confirmed payment');
  assert.equal(await admin.retryLastSave(), true);
  assert.equal(admin.matchPaidCount(), 1);
  assert.equal(database.event_payments.length, 1, 'Payment retry must not duplicate');
  const paid = admin.matchTotalCollected();
  assert.equal(await admin.confirmDinner(['admin','player']), true);
  assert.equal(admin.matchTotalCollected(), paid, 'Closing dinner cannot recalculate pitch collections');
  await admin.setPayment('pitch', 'admin', true);
  assert.equal(admin.matchPendingAmount(), 0);
  assert.equal(await admin.setPayment('dinner','player',true),true);
  const original = clone(database.event_payments.find(p => p.kind==='dinner'));
  assert.equal(await admin.setPayment('dinner','player',false),true);
  assert.equal(admin.dinnerTotalCollected(),0);
  const voided = database.event_payments.find(p => p.id===original.id);
  assert.equal(voided.amount,original.amount);
  assert(voided.voided_at && voided.voided_by);
  await player.loadEvent();
  assert.equal(player.currentEvent().status,'completed');
  assert.equal(player.matchTotalCollected(),55000.01);
  assert.equal(player.payments().length,admin.payments().length);
  assert.equal(await player.updateMyAttendance(false,false),false);
  console.log('PASS: isolated admin/player sessions; confirmed-only saves; offline retry; lost responses; idempotent event/payment creation; stale version conflict; exact cent splits; stage transitions; immutable ledger totals; audited cancellation; reload consistency.');
})().catch(error => { console.error(error); process.exitCode = 1; });
