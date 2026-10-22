/* Push-only service worker: no fetch handler or application caching. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const allowedPaths = new Set(['/', '/cena/menu', '/partido/equipos', '/partido/confirmados']);
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Still display a visible notification. */ }
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title : 'Miércoles FC', {
    body: typeof data.body === 'string' ? data.body : 'Tenés novedades en Miércoles FC.',
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: typeof data.id === 'string' ? data.id : 'miercoles-fc',
    data: { path: allowedPaths.has(data.path) ? data.path : '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = allowedPaths.has(event.notification.data?.path) ? event.notification.data.path : '/';
  const url = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  })());
});
