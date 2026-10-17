/* KO Ekip servis çalışanı: telefona / masaüstüne gelen bildirimler.
   Web'de /sw.js adresinden (tüm site kapsamı), Windows uygulamasında kökten sunulur. */
const BASE = self.location.port === '47811' ? '/' : '/kohesap-app/';
const ICON = BASE + 'icons/icon-192.png';
const BADGE = BASE + 'icons/badge-96.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'KO Ekip', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'KO Ekip';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: ICON,
    badge: BADGE,
    vibrate: d.kind === 'boss' ? [120, 60, 120, 60, 240] : [100, 50, 100],
    data: { url: d.url || '/' },
    timestamp: Date.now(),
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  const page = (/[?&]p=([a-z]+)/.exec(url) || [])[1] || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all.find(w => new URL(w.url).origin === self.location.origin);
    if (c) { await c.focus(); if (page) c.postMessage({ type: 'open', page }); return; }
    await self.clients.openWindow(url);
  })());
});
