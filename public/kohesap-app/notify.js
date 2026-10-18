'use strict';
/* ==========================================================================
   BİLDİRİMLER (telefon ana ekranı / masaüstü)
   - Uygulama telefona "ana ekrana ekle" ile kurulur (PWA); bildirim izni verilince
     cihaz aboneliği kohesapPush/{uid} belgesine yazılır.
   - Sunucu (forgeandplay.com) dakikada bir kontrol eder ve uygulama kapalıyken bile
     gönderir: event başlamadan ve boss çıkmadan X dk önce.
   - Ekipten biri uygulamayı açınca diğer üyelere "çevrimiçi" bildirimi gider
     (aynı kişi için en fazla 30 dakikada bir).
   - Uygulama açıkken ve bu cihazda telefon bildirimi kapalıysa uyarılar yerelde gösterilir.
   ========================================================================== */
const NOTIF = { reg: null, sub: null, doc: null, unsub: null, uid: '', busy: false, err: '', installEvt: null, pinged: false, cronAt: 0, cronChecked: 0, lastSig: '', syncTimer: null };
const DEV_KEY = 'koekip-dev';
const devId = () => { try { let d = localStorage.getItem(DEV_KEY); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 12); localStorage.setItem(DEV_KEY, d); } return d; } catch { return 'd0'; } };
const pushRef = u => FB.doc(CLOUD.db, 'kohesapPush', u);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const apiBase = () => (typeof serverMode !== 'undefined' && serverMode ? siteBase() : '');
const vapidKey = () => (CLOUD.cfg && CLOUD.cfg.push && CLOUD.cfg.push.vapid) || '';
const ntIconUrl = () => (typeof serverMode !== 'undefined' && serverMode ? '/' : '/kohesap-app/') + 'icons/icon-192.png';

/* ---------- servis çalışanı ---------- */
async function swRegister() {
  if (!('serviceWorker' in navigator)) return null;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return null;
  try {
    NOTIF.reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    NOTIF.sub = NOTIF.reg.pushManager ? await NOTIF.reg.pushManager.getSubscription() : null;
  } catch (e) { console.warn('servis çalışanı kaydedilemedi', e); }
  return NOTIF.reg;
}
swRegister();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); NOTIF.installEvt = e; if (ui.page === 'bildirim') render(); });
window.addEventListener('appinstalled', () => { NOTIF.installEvt = null; toast('KO Ekip ana ekrana eklendi', 'ok'); if (ui.page === 'bildirim') render(); });
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'open' && d.page && typeof PAGES !== 'undefined' && PAGES.some(p => p.id === d.page) && CUR.ch) { ui.page = d.page; render(); }
});

/* ---------- abonelik belgesi ---------- */
function notifyWatch() {
  const u = CLOUD.db && myUid();
  if (u === NOTIF.uid) return;
  if (NOTIF.unsub) { try { NOTIF.unsub(); } catch { } NOTIF.unsub = null; }
  NOTIF.uid = u || ''; NOTIF.doc = null; NOTIF.pinged = false; NOTIF.lastSig = '';
  if (!u) return;
  NOTIF.unsub = FB.onSnapshot(pushRef(u), s => { NOTIF.doc = s.exists() ? s.data() : null; if (ui.page === 'bildirim') render(); notifySync(); },
    e => { if (isPermErr(e)) { NOTIF.err = 'Bildirim ayarları için Firebase kurallarının güncel hali yayınlanmalı.'; TEAM.rulesMissing = true; } });
}
const prefs = () => Object.assign({ ev: true, boss: true, online: true, lead: 10 }, NOTIF.doc || {});
const pushHere = () => !!(NOTIF.sub && NOTIF.doc && NOTIF.doc.subs && NOTIF.doc.subs[devId()] && window.Notification && Notification.permission === 'granted');
/** sunucuya gidecek özet: hangi eventler, hangi boss'lar, hangi ekip/sunucu */
function pushPayload() {
  const evs = (S.events || []).filter(e => !e.off && e.days && e.days.length && e.times && e.times.length).slice(0, 40)
    .map(e => ({ n: String(e.name || 'Event').slice(0, 40), d: e.days.slice(0, 7), t: e.times.slice(0, 6), u: e.until || '' }));
  const fixedBoss = typeof BOSSES !== 'undefined' ? BOSSES.filter(b => b.fixed && bellOn(b.id)).map(b => ({ n: '🐉 ' + b.n, d: b.fixed.d, t: b.fixed.t, u: '', k: 'boss' })) : [];
  const bossIds = typeof BOSS !== 'undefined' && BOSS.bells ? BOSS.bells.slice(0, 60) : [];
  return {
    team: (TEAM.doc && TEAM.code) || '', server: typeof bossSrv === 'function' ? srvKey(bossSrv()) : '',
    name: String((CUR.ch && CUR.ch.name) || (CLOUD.user && CLOUD.user.displayName) || '').slice(0, 30),
    evs: evs.concat(fixedBoss), bossAll: !(typeof BOSS !== 'undefined' && BOSS.bells), bossIds,
    lead: typeof BOSS !== 'undefined' ? BOSS.lead || 10 : 10,
  };
}
/** ayarlar değişince (ya da yarım saatte bir) sunucudaki özeti güncelle; yalnızca abone olunmuşsa */
function notifySync(force) {
  if (!NOTIF.doc || !NOTIF.doc.subs || !Object.keys(NOTIF.doc.subs).length || !CUR.ch) return;
  clearTimeout(NOTIF.syncTimer);
  NOTIF.syncTimer = setTimeout(async () => {
    const p = pushPayload(), sig = JSON.stringify(p);
    if (!force && sig === NOTIF.lastSig) return;
    const cur = NOTIF.doc ? JSON.stringify({ team: NOTIF.doc.team || '', server: NOTIF.doc.server || '', name: NOTIF.doc.name || '', evs: NOTIF.doc.evs || [], bossAll: NOTIF.doc.bossAll !== false, bossIds: NOTIF.doc.bossIds || [], lead: NOTIF.doc.lead || 10 }) : '';
    NOTIF.lastSig = sig;
    if (cur === sig) return;
    try { await FB.setDoc(pushRef(myUid()), { ...p, at: Date.now() }, { merge: true }); } catch (e) { console.warn('bildirim özeti', e); }
  }, force ? 300 : 2000);
}
setInterval(() => notifySync(), 60000);

const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function pushEnable() {
  if (NOTIF.busy) return;
  NOTIF.err = '';
  if (!pushSupported()) { NOTIF.err = isIOS() && !isStandalone() ? 'iPhone\'da bildirim için önce KO Ekip\'i ana ekrana ekle ve oradan aç.' : 'Bu tarayıcı bildirimleri desteklemiyor.'; return render(); }
  if (!vapidKey()) { NOTIF.err = 'Sunucuda bildirim anahtarları (VAPID) tanımlı değil. Admin kurulumu tamamlamalı.'; return render(); }
  NOTIF.busy = true; render();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Bildirim izni reddedildi. Tarayıcı / telefon ayarlarından KO Ekip için bildirime izin ver.' : 'Bildirim izni verilmedi.');
    const reg = NOTIF.reg || await swRegister();
    if (!reg) throw new Error('Servis çalışanı kurulamadı (güvenli bağlantı gerekir).');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey) {
      const k = new Uint8Array(sub.options.applicationServerKey), want = b64u(vapidKey());
      if (k.length !== want.length || k.some((x, i) => x !== want[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(vapidKey()) });
    NOTIF.sub = sub;
    const j = sub.toJSON();
    const ua = (isIOS() ? 'iPhone/iPad' : /Android/i.test(navigator.userAgent) ? 'Android' : typeof serverMode !== 'undefined' && serverMode ? 'Windows uygulaması' : /Windows/i.test(navigator.userAgent) ? 'Windows' : /Mac/i.test(navigator.userAgent) ? 'Mac' : 'Cihaz') + (isStandalone() ? ' · ana ekran' : '');
    await FB.setDoc(pushRef(myUid()), { ...pushPayload(), ev: prefs().ev, boss: prefs().boss, online: prefs().online, at: Date.now(),
      subs: { [devId()]: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, at: Date.now(), ua } } }, { merge: true });
    toast('Bildirimler bu cihazda açıldı', 'ok');
    pushTest(true);
  } catch (e) { NOTIF.err = isPermErr(e) ? 'İzin yok: Firebase kurallarının güncel hali yayınlanmalı.' : e.message || String(e); }
  finally { NOTIF.busy = false; render(); }
}
async function pushDisable(id) {
  const me = !id || id === devId();
  try {
    if (me && NOTIF.sub) { await NOTIF.sub.unsubscribe().catch(() => { }); NOTIF.sub = null; }
    await FB.setDoc(pushRef(myUid()), { subs: { [id || devId()]: FB.deleteField() } }, { merge: true });
    toast(me ? 'Bu cihazda bildirimler kapandı' : 'Cihaz kaldırıldı', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function pushPref(k, v) {
  try { await FB.setDoc(pushRef(myUid()), { [k]: v, at: Date.now() }, { merge: true }); } catch (e) { toast(e.message, 'err'); }
}
async function apiPost(path, body) {
  const tok = await CLOUD.user.getIdToken();
  const r = await fetch(apiBase() + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('sunucu ' + r.status));
  return j;
}
async function pushTest(quiet) {
  try { const j = await apiPost('/api/koekip/push/test'); if (!quiet) toast(j.sent ? `Deneme bildirimi gönderildi (${j.sent} cihaz)` : 'Gönderilecek cihaz yok', j.sent ? 'ok' : 'err'); }
  catch (e) { if (!quiet) toast('Gönderilemedi: ' + e.message, 'err'); }
}
/** ekibe anlık bildirim: online / boss çıktı */
async function notifyTeam(type, extra) {
  if (!TEAM.doc || !CLOUD.user) return;
  try { return await apiPost('/api/koekip/push/team', { type, team: TEAM.code, name: String((CUR.ch && CUR.ch.name) || CLOUD.user.displayName || '').slice(0, 30), ...(extra || {}) }); }
  catch (e) { console.warn('ekip bildirimi', e); }
}
/* bildirime dokunarak açılınca ilgili sayfaya git (?p=boss) */
NOTIF.startPage = (/[?&]p=([a-z]+)/.exec(location.search) || [])[1] || '';
/* uygulamaya girince bir kez "çevrimiçi" (sunucu 30 dk sınırı uygular) */
setInterval(() => {
  notifyWatch();
  if (NOTIF.startPage && CUR.ch) { const pg = NOTIF.startPage; NOTIF.startPage = ''; if (PAGES.some(p => p.id === pg && !p.admin)) { ui.page = pg; render(); } try { history.replaceState(null, '', location.pathname); } catch { } }
  if (!NOTIF.pinged && CUR.ch && TEAM.doc && document.visibilityState === 'visible') { NOTIF.pinged = true; notifyTeam('online'); }
}, 4000);
document.addEventListener('visibilitychange', () => {
  // uzun süre arka planda kaldıktan sonra açılınca tekrar dene (sunucu tekrarı süzer)
  if (document.visibilityState === 'hidden') NOTIF.hiddenAt = Date.now();
  else if (NOTIF.hiddenAt && Date.now() - NOTIF.hiddenAt > 30 * 60000) NOTIF.pinged = false;
});

/* ---------- uygulama açıkken yerel uyarı ---------- */
async function cronAlive() {
  if (Date.now() - NOTIF.cronChecked < 5 * 60000) return Date.now() - NOTIF.cronAt < 5 * 60000;
  NOTIF.cronChecked = Date.now();
  try { const s = await FB.getDoc(FB.doc(CLOUD.db, 'kohesapAssets', 'pushCron')); NOTIF.cronAt = s.exists() ? +s.data().at || 0 : 0; } catch { }
  return Date.now() - NOTIF.cronAt < 5 * 60000;
}
/** Telefona bildirim bu cihazda açıksa ve sunucu zamanlayıcısı çalışıyorsa sunucu gönderir; yoksa burada gösterilir. */
async function localNotify(title, body, tag) {
  toast(title.split(' ')[0] + ' ' + body);
  if (pushHere() && await cronAlive()) return;
  if (!window.Notification || Notification.permission !== 'granted') return;
  try {
    const reg = NOTIF.reg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg) await reg.showNotification(title, { body, tag, icon: ntIconUrl(), badge: ntIconUrl(), renotify: true });
    else new Notification(title, { body, tag, icon: ntIconUrl() });
  } catch { }
}

/* ---------- görünüm ---------- */
ICON.bildirim = I('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'boss') + 1, 0, { id: 'bildirim', t: 'Bildirimler', d: 'Telefona / masaüstüne event, boss ve ekip bildirimleri' });

function notifyBanner() {
  if (pushHere()) return '';
  return `<div class="nt-banner"><span class="nt-ic">${ICON.bildirim}</span><div><b>Telefonuna bildirim gelsin</b><span>Uygulama kapalıyken de boss ve event öncesi haber al.</span></div><button class="btn sm pri" data-act="go" data-id="bildirim">Kur</button></div>`;
}
function installCard() {
  if (isStandalone()) return `<div class="nt-step done"><span class="nt-n">✓</span><div><b>Ana ekranda kurulu</b><span class="mut">KO Ekip uygulama olarak açılıyor.</span></div></div>`;
  if (typeof serverMode !== 'undefined' && serverMode) return `<div class="nt-step done"><span class="nt-n">✓</span><div><b>Windows uygulaması</b><span class="mut">Bilgisayarda bildirimler Windows bildirim merkezine gelir. Telefon için forgeandplay.com'u telefondan açıp ana ekrana ekle.</span></div></div>`;
  const how = isIOS()
    ? `<ol class="nt-ios"><li><b>Safari</b>'de forgeandplay.com'u aç</li><li>Alttaki <b>Paylaş</b> düğmesine dokun <span class="nt-share">⬆︎</span></li><li><b>Ana Ekrana Ekle</b>'yi seç</li><li>Ana ekrandaki <b>KO Ekip</b> simgesinden aç ve bu sayfaya dön</li></ol><span class="hint">iPhone'da bildirimler yalnızca ana ekrandan açılan uygulamada çalışır (iOS 16.4 ve üstü).</span>`
    : NOTIF.installEvt ? `<button class="btn pri" data-act="nt-install">📲 Ana ekrana ekle</button>`
      : `<span class="mut">Chrome menüsünden (⋮) <b>Ana ekrana ekle</b> / <b>Uygulamayı yükle</b>'yi seç.</span>`;
  return `<div class="nt-step"><span class="nt-n">1</span><div><b>Ana ekrana ekle</b>${how}</div></div>`;
}
VIEWS.bildirim = () => {
  notifyWatch();
  const p = prefs(), here = pushHere(), subs = (NOTIF.doc && NOTIF.doc.subs) || {};
  const perm = window.Notification ? Notification.permission : 'unsupported';
  const admin = typeof isAdmin === 'function' && isAdmin();
  const srvReady = CLOUD.cfg && CLOUD.cfg.push && CLOUD.cfg.push.ready;
  return (TEAM.rulesMissing && typeof rulesBox === 'function' ? rulesBox() : '') + `
  <div class="nt-hero card">
    <div class="nt-hero-art" aria-hidden="true"><div class="nt-phone"><div class="nt-toast"><img src="icons/icon-192.png" alt=""><div><b>🐉 Boss alarmı</b><span>Talos 10 dk sonra çıkıyor (~21:42 · Zero)</span></div></div><div class="nt-toast t2"><img src="icons/icon-192.png" alt=""><div><b>⏰ Bifrost</b><span>10 dk sonra başlıyor (21:00)</span></div></div><div class="nt-toast t3"><img src="icons/icon-192.png" alt=""><div><b>🟢 Ekip</b><span>Ateşkalbi çevrimiçi oldu</span></div></div></div></div>
    <div class="nt-hero-txt"><h3>Telefonuna KO Ekip bildirimleri</h3>
      <p class="mut">Event başlamadan ve boss çıkmadan <b>${p.lead || 10} dk önce</b>, ekipten biri oyuna girince ve biri boss'u “çıktı” diye duyurunca anında haber al. Uygulama kapalıyken de gelir.</p>
      ${NOTIF.err ? `<div class="callout r" style="margin-top:10px">${esc(NOTIF.err)}</div>` : ''}
    </div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <section class="card"><div class="card-h"><h3>Bu cihaz</h3>${here ? '<span class="badge g">bildirimler açık</span>' : ''}</div>
      <div class="nt-steps">
        ${installCard()}
        <div class="nt-step ${here ? 'done' : ''}"><span class="nt-n">${here ? '✓' : '2'}</span><div><b>Bildirime izin ver</b>
          ${here ? `<span class="mut">Bu cihaza bildirim gelecek.</span><div class="nt-btns"><button class="btn sm" data-act="nt-test">Deneme bildirimi gönder</button><button class="btn sm ghost" data-act="nt-off">Bu cihazda kapat</button></div>`
            : perm === 'denied' ? `<span class="mut">İzin daha önce reddedilmiş. ${isIOS() ? 'Ayarlar → Bildirimler → KO Ekip' : 'Adres çubuğundaki kilit simgesi → Bildirimler → İzin ver'} yolundan açıp tekrar dene.</span><div class="nt-btns"><button class="btn sm pri" data-act="nt-on">Tekrar dene</button></div>`
              : `<div class="nt-btns"><button class="btn pri" data-act="nt-on" ${NOTIF.busy ? 'disabled' : ''}>${NOTIF.busy ? 'Açılıyor…' : '🔔 Bildirimleri aç'}</button></div>`}
        </div></div>
      </div>
    </section>
    <section class="card"><div class="card-h"><h3>Neler için bildirim gelsin?</h3></div>
      <label class="check nt-pref"><input type="checkbox" data-ntp="ev" ${p.ev !== false ? 'checked' : ''}> <span><b>Event öncesi</b><small>Event Takvimi'nde açık olan eventler</small></span></label>
      <label class="check nt-pref"><input type="checkbox" data-ntp="boss" ${p.boss !== false ? 'checked' : ''}> <span><b>Boss çıkmadan önce</b><small>Boss Alarmı'nda zili açık olanlar · ${esc(typeof bossSrv === 'function' ? bossSrv() : '')} sunucusu</small></span></label>
      <label class="check nt-pref"><input type="checkbox" data-ntp="online" ${p.online !== false ? 'checked' : ''}> <span><b>Ekipten biri çevrimiçi olunca</b><small>Aynı kişi için en fazla yarım saatte bir</small></span></label>
      <label class="f" style="margin-top:10px">Ne kadar önce<select class="inp" data-ntlead>${[5, 10, 15, 20, 30].map(m => `<option value="${m}" ${m === (p.lead || 10) ? 'selected' : ''}>${m} dk önce</option>`).join('')}</select></label>
      ${!Object.keys(subs).length ? '<p class="hint">Önce bir cihazda bildirimleri aç; tercihler tüm cihazlarına uygulanır.</p>' : ''}
    </section>
  </div>
  ${Object.keys(subs).length ? `<section class="card" style="margin-top:16px"><div class="card-h"><h3>Bildirim gelen cihazların</h3></div>
    <div class="nt-devs">${Object.entries(subs).map(([id, s]) => `<div class="nt-dev"><b>${esc(s.ua || 'Cihaz')}</b>${id === devId() ? '<span class="badge g">bu cihaz</span>' : ''}<span class="mut">${s.at ? new Date(s.at).toLocaleDateString('tr-TR') : ''}</span><span class="spacer"></span><button class="icon-btn" data-act="nt-del" data-id="${esc(id)}" title="Kaldır">✕</button></div>`).join('')}</div></section>` : ''}
  ${admin ? `<section class="card" style="margin-top:16px"><div class="card-h"><h3>Sunucu durumu <span class="badge y">admin</span></h3></div>
    <div class="nt-admin">
      <div>${srvReady ? '✅' : '⚠️'} Bildirim anahtarları (VAPID) ${srvReady ? 'tanımlı' : 'tanımlı değil — Vercel\'e VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY ekle'}</div>
      <div>${CLOUD.cfg && CLOUD.cfg.push && CLOUD.cfg.push.admin ? '✅' : '⚠️'} Firebase hizmet hesabı ${CLOUD.cfg && CLOUD.cfg.push && CLOUD.cfg.push.admin ? 'tanımlı' : 'tanımlı değil — FIREBASE_SERVICE_ACCOUNT ekle'}</div>
      <div data-ntcron>⏳ Zamanlayıcı kontrol ediliyor…</div>
      <div>${CLOUD.cfg && CLOUD.cfg.turn ? '✅' : '⚠️'} Ses aktarma sunucusu (TURN) ${CLOUD.cfg && CLOUD.cfg.turn ? 'tanımlı' : 'tanımlı değil — CF_TURN_KEY_ID ve CF_TURN_API_TOKEN ekle'}</div>
      <div class="tu-admin" data-tuadmin>⏳ Ses aktarma kullanımı yükleniyor…</div>
    </div></section>` : ''}`;
};
/* admin: bu ayki ses aktarma kullanımı ve aylık sınır (ücretli kısma geçmesin) */
async function paintTurnUsage() {
  const el = document.querySelector('[data-tuadmin]'); if (!el) return;
  let d = {};
  try { const s = await FB.getDoc(FB.doc(CLOUD.db, 'kohesapAssets', 'turnUsage')); d = s.exists() ? s.data() : {}; } catch { }
  const p = new Date(Date.now() + 3 * 3600e3), month = p.getUTCFullYear() + '-' + String(p.getUTCMonth() + 1).padStart(2, '0');
  const gb = d.month === month ? (+d.bytes || 0) / 1e9 : 0, lim = +d.limitGB || 800, pct = Math.min(100, gb / lim * 100);
  const el2 = document.querySelector('[data-tuadmin]'); if (!el2) return;
  el2.innerHTML = `<div>${gb >= lim ? '⛔' : '🎧'} Ses aktarma bu ay: <b>${gb.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB</b> / ${lim} GB${gb >= lim ? ' — sınıra ulaşıldı, aktarma ay başına kadar kapalı' : ''}</div>
    <div class="tu-bar ${pct >= 90 ? 'hot' : ''}" style="margin:6px 0"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><label class="hint" for="tuLimit">Aylık sınır (GB)</label><input class="inp num" id="tuLimit" type="number" min="1" max="1000" step="10" value="${lim}" style="width:110px"><button class="btn sm" data-act="tu-save">Kaydet</button>
    <span class="hint">Cloudflare'de ilk 1000 GB ücretsiz. Sınır en fazla 1000 olabilir; 800 önerilir (ölçüm payı). 8 kişi hepsi aktarmadayken saatte ~4–5 GB harcanır.</span></div>`;
}
ACTIONS['tu-save'] = async () => {
  const v = Math.round(+(document.getElementById('tuLimit') || {}).value || 0);
  if (!(v >= 1 && v <= 1000)) return toast('Sınır 1 ile 1000 GB arasında olmalı', 'err');
  try { await FB.setDoc(FB.doc(CLOUD.db, 'kohesapAssets', 'turnUsage'), { limitGB: v }, { merge: true }); toast('Aylık ses aktarma sınırı: ' + v + ' GB', 'ok'); paintTurnUsage(); }
  catch (e) { toast(e.message, 'err'); }
};
async function paintCron() {
  const el = document.querySelector('[data-ntcron]'); if (!el) return;
  const ok = await cronAlive();
  el.textContent = ok ? `✅ Zamanlayıcı çalışıyor (son: ${new Date(NOTIF.cronAt).toLocaleTimeString('tr-TR')})` : `⚠️ Zamanlayıcı çalışmıyor${NOTIF.cronAt ? ' (son: ' + new Date(NOTIF.cronAt).toLocaleString('tr-TR') + ')' : ''} — cron-job.org'da her dakika /api/koekip/push/cron çağrısı kur`;
}
Object.assign(ACTIONS, {
  'nt-on': () => pushEnable(),
  'nt-off': () => pushDisable(),
  'nt-del': el => pushDisable(el.dataset.id),
  'nt-test': () => pushTest(),
  'nt-install': async () => { const e = NOTIF.installEvt; if (!e) return; e.prompt(); try { await e.userChoice; } catch { } NOTIF.installEvt = null; render(); },
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.ntp) pushPref(d.ntp, e.target.checked);
  if (d.ntlead != null) { const v = +e.target.value || 10; if (typeof BOSS !== 'undefined') { BOSS.lead = v; bossSave(); } pushPref('lead', v); }
});
const _renderN = render;
render = function () { _renderN(); if (ui.page === 'bildirim') { paintCron(); paintTurnUsage(); } };
const _logoutN = logout;
logout = async function () { if (NOTIF.unsub) { NOTIF.unsub(); NOTIF.unsub = null; } NOTIF.uid = ''; NOTIF.doc = null; return _logoutN(); };

/* KO Ekip: ekip özellikleri menünün başında */
(function reorderNav() {
  const order = [
    { sec: 'Ekip' }, 'ekip', 'ses', 'boss', 'event', 'bildirim',
    { sec: 'Defter' }, 'panel', 'kasa', 'ticaret', 'parti',
    { sec: 'Canlı Veri' }, 'gb', 'pazar', 'ilan',
    { sec: 'Hesaplayıcılar' }, 'pus', 'exp', 'basma',
    { sec: 'Veri' }, 'fiyat', 'internet', 'ayar',
  ];
  const byId = Object.fromEntries(PAGES.filter(p => p.id).map(p => [p.id, p]));
  const used = new Set(), out = [];
  order.forEach(x => { if (typeof x === 'object') out.push(x); else if (byId[x]) { out.push(byId[x]); used.add(x); } });
  PAGES.filter(p => p.id && !used.has(p.id)).forEach(p => out.push(p));
  PAGES.splice(0, PAGES.length, ...out);
})();
