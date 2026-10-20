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
    data: { url: d.url || '/app' },
    timestamp: Date.now(),
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || '/app';
  if (url.startsWith('/?')) url = '/app' + url.slice(1);
  const page = (/[?&]p=([a-z]+)/.exec(url) || [])[1] || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // uygulama penceresi (tanıtım sayfası değil)
    const c = all.find(w => { const u = new URL(w.url); return u.origin === self.location.origin && (u.pathname.startsWith('/app') || u.pathname.startsWith('/kohesap-app')); });
    if (c) { await c.focus(); if (page) c.postMessage({ type: 'open', page }); return; }
    await self.clients.openWindow(url);
  })());
});
