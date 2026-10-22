const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const webPush = require('web-push');
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; read.update = fn => { value = fn(value); }; return read; };
let subscription = null, remote = false, fail = false, authChange, permissionRequested = false;
const sentIds = [];
const publicKey = webPush.generateVAPIDKeys().publicKey;
const notification = { permission: 'default', requestPermission: async () => { permissionRequested = true; notification.permission = 'granted'; return 'granted'; } };
const registration = { pushManager: {
  getSubscription: async () => subscription,
  subscribe: async options => {
    assert.equal(notification.permission, 'granted'); assert.equal(options.userVisibleOnly, true); assert.equal(options.applicationServerKey.byteLength, 65);
    const created = { endpoint: 'https://fcm.googleapis.com/client-test', options,
      toJSON: () => ({ endpoint: created.endpoint, keys: {} }), unsubscribe: async () => { subscription = null; return true; } };
    subscription = created; return created;
  }
}, getNotifications: async () => [] };
const jobs = new Map();
const client = {
  auth: { onAuthStateChange: callback => { authChange = callback; } },
  functions: { invoke: async (_, { body }) => {
    if (body.action === 'send') sentIds.push(body.id);
    if (fail) return { error: new Error('Offline') };
    if (body.action === 'config') return { data: { publicKey, devices: remote ? 1 : 0 } };
    if (body.action === 'subscribe') { remote = true; return { data: { subscribed: true } }; }
    if (body.action === 'unsubscribe') { remote = false; return { data: { subscribed: false } }; }
    if (body.action === 'send') {
      const job = jobs.get(body.id) ?? { ...body, status: 'finished', accepted: 1, total: 1, remaining: 0 };
      jobs.set(body.id, job); return { data: { job } };
    }
    throw new Error('Unexpected request');
  } },
  from: table => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: remote ? { id: 'device' } : null }),
      then: (yes, no) => Promise.resolve({ data: [...jobs.values()] }).then(yes, no) };
    return query;
  }
};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/services/push-notifications.service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
}).outputText, { exports: exportsObject,
  require: name => name === '@angular/core' ? { Injectable: () => value => value, signal, inject: () => ({ client }) } : {},
  window: { isSecureContext: true, PushManager: {}, Notification: notification, matchMedia: () => ({ matches: true }) },
  navigator: { userAgent: 'iPhone', serviceWorker: { register: async () => registration, ready: Promise.resolve(registration) } },
  Notification: notification, Uint8Array, atob: value => Buffer.from(value, 'base64').toString('binary'), setTimeout, clearTimeout, crypto
});
(async () => {
  const service = new exportsObject.PushNotificationsService();
  await service.load(true);
  assert.equal(service.active(), false);
  const enabling = service.enable();
  assert.equal(permissionRequested, true); // Permission is requested synchronously during the user's click.
  await enabling;
  assert.equal(service.active(), true); assert.equal(remote, true);
  fail = true;
  await service.disable();
  assert.equal(subscription, null); assert.equal(service.active(), false); // Local unsubscribe still works if server is offline.
  fail = false;
  await service.enable(); assert.equal(service.active(), true);
  fail = true;
  assert.equal(await service.send({ title: 'Test', body: 'Message', path: '/' }), false);
  const originalId = service.pendingJob().id;
  assert.equal(await service.send({ title: 'Other', body: 'Message', path: '/' }), false);
  fail = false;
  assert.equal(await service.retry(), true);
  assert.equal(sentIds[0], originalId); assert.equal(sentIds[1], originalId); assert.equal(jobs.size, 1);
  authChange('SIGNED_OUT');
  assert.equal(service.active(), false); assert.equal(service.history().length, 0); assert.equal(service.pendingJob(), null);
  console.log('Push client: installed iOS support, direct permission gesture, device activation, offline unsubscribe, same-job retry and logout privacy verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
