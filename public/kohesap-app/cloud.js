'use strict';
/* ==========================================================================
   BULUT: Google girişi + Firestore senkronu (exe ve web ortak)
   Firestore yapısı:
     kohesap/{uid}                 → { shared, charIds, updatedAt }
     kohesap/{uid}/chars/{charId}  → { name, nation, cls, ..., data, updatedAt }
   Canlı veriler (GB tablosu, pazar) buluta yazılmaz; her cihaz kendisi çeker.
   ========================================================================== */

const SITE = 'https://forgeandplay.com';
/** Sitenin korumalı API'leri için kimlik başlığı (yalnızca onaylı üyeler kullanabilir) */
async function authHdr() { try { return CLOUD.user && CLOUD.user.getIdToken ? { Authorization: 'Bearer ' + await CLOUD.user.getIdToken() } : {}; } catch { return {}; } }
const authFetch = async (url, opt = {}) => fetch(url, { ...opt, headers: { ...(opt.headers || {}), ...(await authHdr()) } });
/** API çağrıları için asıl alan adı (site yapılandırmasından; www yönlendirmesi CORS'u bozmasın) */
const siteBase = () => (CLOUD.cfg && /^https:\/\/(www\.)?forgeandplay\.com$/.test(CLOUD.cfg.site || '') ? CLOUD.cfg.site : SITE);
const CLOUD = { ready: false, user: null, db: null, auth: null, cfg: null, last: { shared: '', chars: {} }, unsub: [], saving: false, imported: 0 };
let LOCAL_DB = null; // exe: bu bilgisayardaki eski (yerel hesaplı) veri

/* ---------- admin ve merkezi veri kaynakları ----------
   Site adresleri (GB, pazar, event) yalnızca admin tarafından config/kohesap
   belgesinde tutulur; tüm kullanıcıların uygulaması bunları kullanır, ama
   arayüzde yalnızca admin görür. (Kurallar: config herkese okunur, admin yazar.) */
const ADMIN_EMAILS = ['carkci.caner@gmail.com'];
const GLOBAL_KEYS = ['gbUrl', 'gbUrl2', 'marketUrl', 'eventsUrl', 'marketMaxPages', 'marketRefreshSec', 'gbRefreshMin', 'voiceTurn'];
const isAdmin = () => !!(typeof CLOUD !== 'undefined' && CLOUD.user && CLOUD.user.emailVerified !== false && ADMIN_EMAILS.includes(String(CLOUD.user.email || '').toLowerCase()));
async function loadGlobalConfig() {
  try {
    const snap = await FB.getDoc(FB.doc(CLOUD.db, 'config', 'kohesap'));
    const g = snap.exists() ? (snap.data().sources || {}) : {};
    GLOBAL_KEYS.forEach(k => { if (g[k] != null && g[k] !== '') DB.shared.settings[k] = g[k]; });
    CLOUD.global = g;
  } catch (e) { console.warn('merkezi ayarlar okunamadı', e); }
}
/* Admin'in "herkese yayınla" dediği içerik: event takvimi ve PUS fiyat listesi.
   Kullanıcının kendi eklediği eventler / özel PUS itemleri korunur. */
async function loadGlobalContent() {
  try {
    const snap = await FB.getDoc(FB.doc(CLOUD.db, 'config', 'kohesapContent'));
    if (!snap.exists()) return;
    const g = snap.data(); CLOUD.content = g;
    const v = g.v || 0;
    if (v <= (DB.shared.contentV || 0)) return;
    if (Array.isArray(g.events) && g.events.length) {
      DB.shared.events = DB.shared.events.filter(e => e.src !== 'usko' && e.src !== 'global')
        .concat(g.events.map(e => ({ ...e, id: uid(), src: 'global', off: false })));
    }
    if (Array.isArray(g.pusCatalog) && g.pusCatalog.length) {
      DB.shared.pusCatalog = DB.shared.pusCatalog.filter(x => x.custom).concat(g.pusCatalog.map(x => ({ ...x, custom: false })));
    }
    DB.shared.contentV = v;
    CLOUD.contentApplied = true;
  } catch (e) { console.warn('yayınlanan içerik okunamadı', e); }
}
async function publishContent(kind) {
  if (!isAdmin()) return;
  const ref = FB.doc(CLOUD.db, 'config', 'kohesapContent');
  const cur = CLOUD.content || {};
  const body = { events: cur.events || [], pusCatalog: cur.pusCatalog || [], v: Date.now(), by: CLOUD.user.email, updatedAt: FB.serverTimestamp() };
  if (kind === 'events') body.events = strip(S.events.filter(e => !e.off).map(({ id, src, off, ...e }) => e));
  if (kind === 'pus') body.pusCatalog = strip(S.pus.catalog.map(({ custom, ...x }) => x));
  await FB.setDoc(ref, body);
  CLOUD.content = body;
  DB.shared.contentV = body.v;
  if (kind === 'events') S.events.forEach(e => { e.src = 'global'; });
  save();
}
async function saveGlobalConfig() {
  if (!isAdmin()) return;
  const g = {}; GLOBAL_KEYS.forEach(k => { g[k] = S.settings[k]; });
  await FB.setDoc(FB.doc(CLOUD.db, 'config', 'kohesap'), { sources: g, updatedAt: FB.serverTimestamp(), by: CLOUD.user.email });
  CLOUD.global = g;
}

const strip = o => JSON.parse(JSON.stringify(o ?? null));
function sharedForCloud() {
  const sh = { ...DB.shared };
  delete sh.gbMarket;
  return strip(sh);
}
const charMeta = ch => ({ name: ch.name, nation: ch.nation, cls: ch.cls, race: RACE_FIX[ch.race] || ch.race || '', level: ch.level, server: ch.server || '', clan: ch.clan || '', note: ch.note || '', master: ch.master !== false, rtype: ch.rtype || 'okcu', created: ch.created || '', played: ch.played || '' });

async function cloudConfig() {
  // exe: program kendi içinden alır (tarayıcı CORS kısıtı yok, son ayar diskte saklı)
  const url = serverMode ? '/api/siteconfig' : '/api/kohesap/config';
  const r = await fetchT(url, { cache: 'no-store' }, 12000).catch(e => { throw new Error(e.name === 'AbortError' ? 'Sunucu yanıt vermedi (bağlantını kontrol et)' : e.message); });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || ('Sunucu yapılandırması alınamadı (' + r.status + ')'));
  const c = await r.json();
  if (!c.firebase || !c.firebase.apiKey) throw new Error('Firebase yapılandırması eksik');
  return c;
}
async function cloudInit() {
  if (CLOUD.ready) return;
  CLOUD.cfg = await cloudConfig();
  if (!serverMode && CLOUD.cfg.exeVersion) $('#ver').textContent = 'web · v' + CLOUD.cfg.exeVersion;
  const app = FB.getApps().length ? FB.getApp() : FB.initializeApp(CLOUD.cfg.firebase);
  CLOUD.auth = FB.getAuth(app);
  await FB.setPersistence(CLOUD.auth, FB.browserLocalPersistence);
  let noCache = false; try { noCache = localStorage.getItem('koekip-nocache') === '1'; } catch { }
  try {
    CLOUD.db = noCache ? FB.initializeFirestore(app, {}) : FB.initializeFirestore(app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) });
  } catch {
    CLOUD.db = FB.initializeFirestore(app, {});
  }
  CLOUD.ready = true;
}
async function cloudSignIn() {
  const p = new FB.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  await FB.signInWithPopup(CLOUD.auth, p);
}

/* ---------- yükleme ---------- */
async function cloudLoad(user) {
  const uid = user.uid;
  const mainRef = FB.doc(CLOUD.db, 'kohesap', uid);
  // telefonlarda tarayıcı veritabanı (IndexedDB) bazen takılır: 20 sn'de gelmezse bir dahaki açılışta önbelleksiz çalış
  const timeout = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Kayıtlar zamanında yüklenemedi'), { slow: true })), 20000));
  let mainSnap, charSnap;
  try { [mainSnap, charSnap] = await Promise.race([Promise.all([FB.getDoc(mainRef), FB.getDocs(FB.collection(CLOUD.db, 'kohesap', uid, 'chars'))]), timeout]); }
  catch (e) { if (e.slow) { try { localStorage.setItem('koekip-nocache', '1'); } catch { } } throw e; }
  const remoteChars = {};
  charSnap.forEach(d => { remoteChars[d.id] = d.data(); });
  const acc = { id: uid, user: user.email || user.displayName || 'Google', name: user.displayName || '', photo: user.photoURL || '', chars: [] };
  let shared = null;
  if (mainSnap.exists()) {
    const m = mainSnap.data();
    shared = m.shared || null;
    const ids = (m.charIds || Object.keys(remoteChars)).filter(id => remoteChars[id]);
    Object.keys(remoteChars).forEach(id => { if (!ids.includes(id)) ids.push(id); });
    acc.chars = ids.slice(0, MAX_CHARS).map(id => ({ id, ...charMeta(remoteChars[id]), data: remoteChars[id].data }));
  }
  const gbMarket = DB && DB.shared ? DB.shared.gbMarket : null;
  const built = migrateDB({ v: 2, shared: shared || defaultDB().shared, accounts: [acc] });
  built.shared.gbMarket = gbMarket;
  built.cloudUid = uid;
  // Bulutta henüz veri yoksa: bu bilgisayardaki eski karakterleri aktar
  CLOUD.imported = 0;
  if (!mainSnap.exists() && LOCAL_DB && !LOCAL_DB.cloudUid) {
    const localChars = (LOCAL_DB.accounts || []).flatMap(a => a.chars || []).slice(0, MAX_CHARS);
    if (localChars.length) { built.accounts[0].chars = strip(localChars); CLOUD.imported = localChars.length; }
    if (LOCAL_DB.legacy) built.legacy = LOCAL_DB.legacy;
    const ls = LOCAL_DB.shared || {};
    ['settings', 'prices', 'sources', 'events', 'pusCatalog', 'expTable'].forEach(k => { if (ls[k] && (!Array.isArray(ls[k]) || ls[k].length)) built.shared[k] = strip(ls[k]); });
  }
  DB = built;
  CUR.acc = DB.accounts[0];
  // son kaydedilen hali (değişiklik tespiti için)
  CLOUD.last.chars = {}; CLOUD.base = { main: null, chars: {} };
  setBase(mainSnap.exists() ? { shared: sharedForCloud(), charIds: CUR.acc.chars.map(c => c.id) } : null);
  if (!CLOUD.imported) CUR.acc.chars.forEach(c => setBase(undefined, { [c.id]: charBody(c) }));
  CLOUD.user = user;
  await loadGlobalConfig();
  await loadGlobalContent();
  if (!mainSnap.exists()) await cloudSave(true);
  watchRemote(uid);
}

/* ---------- kaydetme ----------
   Kayıt kaybı olmasın diye her kayıt SUNUCUDAKİ son hâlle birleştirilerek yazılır (işlem / transaction):
   - "taban" = bu cihazın en son eşitlediği hâl, "yerel" = şimdiki hâl, "uzak" = sunucudaki hâl.
   - Kimlikli listeler (gelir-gider, ticaret, parti, drop, PUS alımı, EXP oturumu …) kayıt kayıt birleşir:
     iki cihaz aynı anda farklı kayıt eklese de ikisi de kalır; silinen silinmiş kalır.
   - Aynı alan iki yerde farklı değiştiyse bu cihazdaki değer geçerli olur.
   Bağlantı yoksa kayıt cihazda sıraya alınır ve internet gelince gönderilir. */
const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
const same = (a, b) => stable(a) === stable(b);
const hasIds = a => Array.isArray(a) && a.length > 0 && a.every(x => x && typeof x === 'object' && x.id != null);
function merge3(b, l, r) {
  if (same(l, r)) return l;
  if (b !== undefined && same(l, b)) return r;
  if (b !== undefined && same(r, b)) return l;
  if (Array.isArray(l) && Array.isArray(r)) {
    if ((hasIds(l) || !l.length) && (hasIds(r) || !r.length) && (l.length || r.length)) {
      const B = new Map((Array.isArray(b) ? b : []).filter(x => x && x.id != null).map(x => [x.id, x]));
      const L = new Map(l.map(x => [x.id, x])), R = new Map(r.map(x => [x.id, x]));
      const out = [], seen = new Set();
      const pick = id => {
        const bx = B.get(id), lx = L.get(id), rx = R.get(id);
        if (lx && rx) return merge3(bx, lx, rx);
        if (lx) return bx && same(bx, lx) ? null : lx;   // uzakta silinmiş: burada değişmediyse silinsin
        if (rx) return bx && same(bx, rx) ? null : rx;   // burada silinmiş: uzakta değişmediyse silinsin
        return null;
      };
      // sıra: yerel sıra korunur, uzaktan gelen yeniler sona eklenir
      for (const x of l) { if (seen.has(x.id)) continue; seen.add(x.id); const v = pick(x.id); if (v) out.push(v); }
      for (const x of r) { if (seen.has(x.id)) continue; seen.add(x.id); const v = pick(x.id); if (v) out.push(v); }
      return out;
    }
    if (l.every(x => typeof x !== 'object') && r.every(x => typeof x !== 'object')) {
      // düz listeler (ör. karakter sırası): yerel + uzakta yeni eklenenler, burada silinenler hariç
      const bb = Array.isArray(b) ? b : [];
      return l.concat(r.filter(x => !l.includes(x) && !bb.includes(x)));
    }
    return l;
  }
  if (l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)) {
    const bo = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const out = {};
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k => {
      if (!(k in l)) { if (k in bo && same(r[k], bo[k])) return; out[k] = r[k]; return; }
      if (!(k in r)) { if (k in bo && same(l[k], bo[k])) return; out[k] = l[k]; return; }
      out[k] = merge3(bo[k], l[k], r[k]);
    });
    return out;
  }
  return l;
}
const charBody = ch => strip({ ...charMeta(ch), data: ch.data });
CLOUD.base = { main: null, chars: {} };
function setBase(main, chars) {
  if (main !== undefined) { CLOUD.base.main = main ? strip(main) : null; CLOUD.last.shared = main ? stable(main) : ''; }
  if (chars) Object.entries(chars).forEach(([id, b]) => { if (b) { CLOUD.base.chars[id] = strip(b); CLOUD.last.chars[id] = stable(b); } else { delete CLOUD.base.chars[id]; delete CLOUD.last.chars[id]; } });
}
async function cloudSave(force) {
  if (!CLOUD.user || !DB || !CUR.acc) return;
  const uid = CLOUD.user.uid;
  const ids = CUR.acc.chars.map(c => c.id);
  const mainLocal = { shared: sharedForCloud(), charIds: ids };
  const mainChanged = force || stable(mainLocal) !== CLOUD.last.shared;
  const charsChanged = [];
  for (const ch of CUR.acc.chars) {
    const body = charBody(ch), j = stable(body);
    if (j.length > 900000) { toast(`${ch.name}: kayıtlar çok büyüdü (${Math.round(j.length / 1024)} KB). Eski kayıtları dışa aktarıp temizleyin.`, 'err'); continue; }
    if (force || j !== CLOUD.last.chars[ch.id]) charsChanged.push({ ch, body });
  }
  const removed = Object.keys(CLOUD.last.chars).filter(id => !ids.includes(id));
  if (!mainChanged && !charsChanged.length && !removed.length) return;
  CLOUD.saving = true;
  const mainRef = FB.doc(CLOUD.db, 'kohesap', uid), charRef = id => FB.doc(CLOUD.db, 'kohesap', uid, 'chars', id);
  try {
    let result;
    try {
      result = await FB.runTransaction(CLOUD.db, async t => {
        const mSnap = mainChanged ? await t.get(mainRef) : null;
        const cSnaps = [];
        for (const x of charsChanged) cSnaps.push(await t.get(charRef(x.ch.id)));
        const res = { main: undefined, chars: {} };
        if (mainChanged) {
          const rm = mSnap && mSnap.exists() ? mSnap.data() : null;
          const remote = rm ? strip({ shared: rm.shared || {}, charIds: rm.charIds || [] }) : null;
          const merged = remote && CLOUD.base.main ? merge3(CLOUD.base.main, strip(mainLocal), remote) : strip(mainLocal);
          // bu cihazda silinen karakter, uzaktan geri gelmesin
          merged.charIds = (merged.charIds || []).filter(id => ids.includes(id) || !(CLOUD.base.main && (CLOUD.base.main.charIds || []).includes(id))).slice(0, MAX_CHARS);
          t.set(mainRef, { ...merged, updatedAt: FB.serverTimestamp(), app: serverMode ? 'exe' : 'web' });
          res.main = merged;
        }
        charsChanged.forEach((x, i) => {
          const rs = cSnaps[i], rd = rs && rs.exists() ? rs.data() : null;
          const remote = rd ? strip({ ...charMeta(rd), data: rd.data || {} }) : null;
          const base = CLOUD.base.chars[x.ch.id];
          const merged = remote && base ? merge3(base, x.body, remote) : x.body;
          t.set(charRef(x.ch.id), { ...merged, updatedAt: FB.serverTimestamp() });
          res.chars[x.ch.id] = merged;
        });
        removed.forEach(id => t.delete(charRef(id)));
        return res;
      });
    } catch (e) {
      if (isPermLike(e)) throw e;
      // çevrimdışı / geçici hata: birleştirmeden sıraya al (internet gelince gider)
      const batch = FB.writeBatch(CLOUD.db), res = { main: undefined, chars: {} };
      if (mainChanged) { batch.set(mainRef, { ...strip(mainLocal), updatedAt: FB.serverTimestamp(), app: serverMode ? 'exe' : 'web' }); res.main = strip(mainLocal); }
      charsChanged.forEach(x => { batch.set(charRef(x.ch.id), { ...x.body, updatedAt: FB.serverTimestamp() }); res.chars[x.ch.id] = x.body; });
      removed.forEach(id => batch.delete(charRef(id)));
      const commit = batch.commit();
      // bağlantı yokken commit bitmez; yerel kuyruğa yazıldığı an yeterli
      await Promise.race([commit, new Promise(r => setTimeout(r, 4000))]);
      result = res;
    }
    // birleşen sonuç bu cihaza uygulanır (diğer cihazdan gelen kayıtlar görünsün)
    let changedHere = false;
    if (result.main) {
      if (!same(result.main.shared, mainLocal.shared)) {
        const gb = DB.shared.gbMarket;
        DB.shared = migrateDB({ v: 2, shared: strip(result.main.shared), accounts: [] }).shared; DB.shared.gbMarket = gb; changedHere = true;
      }
      if (!same(result.main.charIds, ids)) { CUR.acc.chars = result.main.charIds.map(id => CUR.acc.chars.find(c => c.id === id)).filter(Boolean); changedHere = true; }
      setBase(result.main);
    }
    Object.entries(result.chars).forEach(([id, merged]) => {
      const c = CUR.acc.chars.find(x => x.id === id);
      if (c && !same(merged, charBody(c))) { Object.assign(c, charMeta(merged)); c.data = Object.assign(newCharData(c.level), merged.data || {}); changedHere = true; }
      setBase(undefined, { [id]: merged });
    });
    removed.forEach(id => setBase(undefined, { [id]: null }));
    if (changedHere) { bindView(); const au = $('#auth'); if (CUR.ch && (!au || au.hidden)) render(); }
  } finally { CLOUD.saving = false; }
}
const isPermLike = e => e && (e.code === 'permission-denied' || e.code === 'unauthenticated' || /insufficient permissions/i.test(e.message || ''));

/* ---------- başka cihazdan gelen değişiklikler ---------- */
function watchRemote(uid) {
  CLOUD.unsub.forEach(f => f()); CLOUD.unsub = [];
  CLOUD.unsub.push(FB.onSnapshot(FB.doc(CLOUD.db, 'kohesap', uid), snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites || saveTimer || CLOUD.saving) return;
    const m = snap.data();
    const remote = strip({ shared: m.shared || {}, charIds: m.charIds || [] });
    if (stable(remote) === CLOUD.last.shared) return;
    const gb = DB.shared.gbMarket;
    DB.shared = migrateDB({ v: 2, shared: m.shared, accounts: [] }).shared;
    DB.shared.gbMarket = gb;
    setBase(remote);
    // karakter sırası / silinenler
    if (m.charIds) CUR.acc.chars = m.charIds.map(id => CUR.acc.chars.find(c => c.id === id)).filter(Boolean);
    remoteApplied();
  }));
  CLOUD.unsub.push(FB.onSnapshot(FB.collection(CLOUD.db, 'kohesap', uid, 'chars'), qs => {
    if (qs.metadata.hasPendingWrites || saveTimer || CLOUD.saving) return;
    let changed = false;
    qs.docChanges().forEach(ch => {
      const id = ch.doc.id;
      if (ch.type === 'removed') {
        if (CUR.acc.chars.some(c => c.id === id)) { CUR.acc.chars = CUR.acc.chars.filter(c => c.id !== id); setBase(undefined, { [id]: null }); changed = true; }
        return;
      }
      const d = ch.doc.data();
      const body = strip({ ...charMeta(d), data: d.data || {} });
      const j = stable(body);
      if (j === CLOUD.last.chars[id]) return;
      let c = CUR.acc.chars.find(x => x.id === id);
      if (!c) { if (CUR.acc.chars.length >= MAX_CHARS) return; c = { id }; CUR.acc.chars.push(c); }
      Object.assign(c, charMeta(d));
      c.data = Object.assign(newCharData(c.level), d.data || {});
      setBase(undefined, { [id]: body });
      changed = true;
    });
    if (changed) remoteApplied();
  }));
}
function remoteApplied() {
  if (CUR.ch && !CUR.acc.chars.includes(CUR.ch)) { CUR.ch = CUR.acc.chars.find(c => c.id === CUR.ch.id) || null; }
  bindView();
  if ($('#auth') && !$('#auth').hidden) { if (auth.mode === 'chars') showAuth('chars'); return; }
  if (!CUR.ch) { showAuth('chars'); return; }
  render();
  toast('Başka bir cihazdaki değişiklikler alındı');
}

async function cloudSignOut() {
  CLOUD.unsub.forEach(f => f()); CLOUD.unsub = [];
  CLOUD.user = null;
  try { await FB.signOut(CLOUD.auth); } catch { }
}
async function cloudDeleteAll() {
  const uid = CLOUD.user.uid;
  const batch = FB.writeBatch(CLOUD.db);
  CUR.acc.chars.forEach(c => batch.delete(FB.doc(CLOUD.db, 'kohesap', uid, 'chars', c.id)));
  Object.keys(CLOUD.last.chars).forEach(id => batch.delete(FB.doc(CLOUD.db, 'kohesap', uid, 'chars', id)));
  batch.delete(FB.doc(CLOUD.db, 'kohesap', uid));
  await batch.commit();
}

/* ---------- sürüm kontrolü (exe) ---------- */
function versionNewer(a, b) {
  const pa = String(a || '').split('.').map(Number), pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
}
function sideExtra() {
  const el = $('#sideExtra'); if (!el) return;
  const cur = ($('#ver').textContent || '').replace(/^v/, '');
  if (!serverMode) {
    el.innerHTML = `<a class="side-dl" href="/downloads/KOEkip.exe" download>${ICON.dl}<span>Windows uygulamasını indir<small>aynı Google hesabıyla senkron</small></span></a>`;
  } else if (CLOUD.cfg && CLOUD.cfg.exeVersion && versionNewer(CLOUD.cfg.exeVersion, cur)) {
    el.innerHTML = `<a class="side-dl new" href="${SITE}${CLOUD.cfg.exeUrl || '/downloads/KOEkip.exe'}" target="_blank" rel="noopener">${ICON.dl}<span>Yeni sürüm: v${esc(CLOUD.cfg.exeVersion)}<small>indirip eskisinin yerine koy</small></span></a>`;
  } else el.innerHTML = '';
}
