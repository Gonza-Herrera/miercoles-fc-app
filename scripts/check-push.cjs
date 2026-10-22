const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const webPush = require('web-push');
const clone = value => structuredClone(value);
function moduleFrom(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText, { exports, require: key => imports[key] ?? {}, URL, Headers, Request, Response,
    AbortSignal, Uint8Array, setTimeout, clearTimeout, crypto, ...globals });
  return exports;
}
const { createPushHandler, validPushEndpoint } = moduleFrom('supabase/functions/push-notifications/handler.ts');
for (const endpoint of ['http://localhost/token', 'https://127.0.0.1/token', 'https://fcm.googleapis.com.evil.test/token', 'https://user:pass@fcm.googleapis.com/token', 'https://fcm.googleapis.com:8443/token', 'https://fcm.googleapis.com/token#evil']) {
  assert.equal(validPushEndpoint(endpoint), false);
}
const vapid = webPush.generateVAPIDKeys();
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const browserKeys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
const db = { push_subscriptions: [
  { id: 'one', user_id: 'a', endpoint: 'https://web.push.apple.com/good', keys: browserKeys },
  { id: 'two', user_id: 'b', endpoint: 'https://fcm.googleapis.com/expired', keys: browserKeys },
  { id: 'three', user_id: 'c', endpoint: 'https://updates.push.services.mozilla.com/uncertain', keys: browserKeys }
], push_jobs: [], push_deliveries: [] };
let authCalls = 0, sent = 0;
const client = {
  auth: { getUser: async token => { authCalls++; return token === 'admin' ? { data: { user: { id: 'admin-id', email: 'gon.herrera.dev@gmail.com' } } } : token === 'member' ? { data: { user: { id: 'a', email: 'member@example.com', user_metadata: { email: 'gon.herrera.dev@gmail.com' } } } } : { error: true, data: { user: null } }; } },
  from: table => {
    const filters = []; let operation = 'read', payload, head = false;
    const run = single => {
      const rows = db[table].filter(row => filters.every(([key, value]) => row[key] === value));
      if (operation === 'update') rows.forEach(row => Object.assign(row, clone(payload)));
      if (operation === 'delete') db[table] = db[table].filter(row => !rows.includes(row));
      if (operation === 'upsert') {
        const old = db[table].find(row => row.endpoint === payload.endpoint);
        if (old) Object.assign(old, clone(payload)); else db[table].push({ id: crypto.randomUUID(), ...clone(payload) });
      }
      return Promise.resolve({ data: head ? null : clone(single ? rows[0] ?? null : rows), count: rows.length, error: null });
    };
    const q = { select: (_, opts) => { head = !!opts?.head; return q; }, eq: (key, value) => { filters.push([key, value]); return q; },
      update: data => { operation = 'update'; payload = data; return q; }, delete: () => { operation = 'delete'; return q; },
      upsert: data => { operation = 'upsert'; payload = data; return q; }, maybeSingle: () => run(true), then: (yes, no) => run(false).then(yes, no) };
    return q;
  },
  rpc: async (name, args) => {
    if (name === 'push_vapid_read') return { data: vapid };
    if (name === 'create_push_job') {
      let job = db.push_jobs.find(row => row.id === args.p_id);
      if (!job) {
        job = { id: args.p_id, title: args.p_title, body: args.p_body, path: args.p_path, total: db.push_subscriptions.length, remaining: db.push_subscriptions.length, status: 'queued' };
        db.push_jobs.push(job);
        db.push_deliveries.push(...db.push_subscriptions.map(sub => ({ job_id: job.id, subscription_id: sub.id, user_id: sub.user_id, status: 'pending' })));
      }
      return { data: [clone(job)] };
    }
    if (name === 'claim_push_deliveries') {
      const rows = db.push_deliveries.filter(row => row.job_id === args.p_job && row.status === 'pending').slice(0, 15);
      rows.forEach(row => { row.status = 'sending'; }); return { data: clone(rows) };
    }
    if (name === 'summarize_push_job') {
      const job = db.push_jobs.find(row => row.id === args.p_job), rows = db.push_deliveries.filter(row => row.job_id === job.id);
      for (const status of ['accepted', 'failed', 'expired', 'uncertain']) job[status] = rows.filter(row => row.status === status).length;
      job.remaining = rows.filter(row => ['pending', 'sending'].includes(row.status)).length;
      job.status = job.remaining ? 'sending' : 'finished'; return { data: [clone(job)] };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
};
const handler = createPushHandler(client, webPush, async (url, request) => {
  sent++;
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(request.body.byteLength > 100); // Actual encrypted Web Push payload, not plaintext JSON.
  assert.ok(!Buffer.from(request.body).includes(Buffer.from('Recordatorio')));
  if (url.endsWith('uncertain')) throw new Error('Network timeout');
  return new Response(null, { status: url.endsWith('expired') ? 410 : 201 });
});
const request = (body, token, origin = 'https://miercoles-fc.netlify.app') => new Request('https://edge.test/push', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body)
});

(async () => {
  assert.equal((await handler(request({ action: 'config' }))).status, 401);
  assert.equal(authCalls, 0);
  assert.equal((await handler(request({ action: 'config' }, 'invalid'))).status, 401);
  assert.equal((await handler(request({ action: 'config' }, 'admin', 'https://evil.test'))).status, 403);
  const config = await (await handler(request({ action: 'config' }, 'member'))).json();
  assert.equal(config.publicKey, vapid.publicKey); assert.equal(config.privateKey, undefined); assert.equal(config.devices, null);
  const payload = { action: 'send', id: crypto.randomUUID(), title: 'Recordatorio', body: 'Mañana hay partido', path: '/' };
  assert.equal((await handler(request(payload, 'member'))).status, 403);
  assert.equal((await handler(request({ ...payload, path: 'https://evil.test' }, 'admin'))).status, 400);
  assert.equal((await handler(request({ action: 'subscribe', subscription: { endpoint: 'http://localhost/token', keys: browserKeys } }, 'member'))).status, 400);
  const response = await handler(request(payload, 'admin'));
  assert.equal(response.status, 200);
  const { job } = await response.json();
  assert.equal(job.accepted, 1); assert.equal(job.expired, 1); assert.equal(job.uncertain, 1); assert.equal(job.remaining, 0);
  assert.equal(sent, 3);
  await handler(request(payload, 'admin')); assert.equal(sent, 3); // Retrying the same operation never sends twice.
  assert.equal(db.push_subscriptions.some(sub => sub.id === 'two'), false); // Prune expired endpoints.
  await handler(request({ action: 'unsubscribe', endpoint: 'https://updates.push.services.mozilla.com/uncertain' }, 'member'));
  assert.equal(db.push_subscriptions.some(sub => sub.id === 'three'), true); // A member cannot remove another account's device.

  const listeners = {}, shown = [], opened = [];
  vm.runInNewContext(fs.readFileSync('public/push-sw.js', 'utf8'), { URL, Set,
    self: { addEventListener: (type, callback) => { listeners[type] = callback; }, location: { origin: 'https://miercoles-fc.netlify.app' },
      registration: { showNotification: async (title, options) => shown.push({ title, options }) },
      clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } }
  });
  let work;
  listeners.push({ data: { json: () => ({ title: 'Cena', body: 'Hamburguesas', path: 'https://evil.test', id: 'send-1' }) }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(shown[0].options.data.path, '/'); assert.equal(shown[0].options.tag, 'send-1');
  listeners.push({ data: { json: () => { throw new Error('Bad JSON'); } }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(shown[1].title, 'Miércoles FC'); // Every push is visible, including malformed payloads.
  listeners.notificationclick({ notification: { close() {}, data: { path: '/cena/menu' } }, waitUntil: promise => { work = promise; } });
  await work; assert.equal(opened[0], 'https://miercoles-fc.netlify.app/cena/menu');
  console.log('Push: authenticated admin, private keys, endpoint validation, real payload encryption, idempotent fan-out, expired/uncertain deliveries and service worker verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
