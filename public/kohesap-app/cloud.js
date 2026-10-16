'use strict';
/* ==========================================================================
   BULUT: Google girişi + Firestore senkronu (exe ve web ortak)
   Firestore yapısı:
     kohesap/{uid}                 → { shared, charIds, updatedAt }
     kohesap/{uid}/chars/{charId}  → { name, nation, cls, ..., data, updatedAt }
   Canlı veriler (GB tablosu, pazar) buluta yazılmaz; her cihaz kendisi çeker.
   ========================================================================== */

const SITE = 'https://forgeandplay.com';
const CLOUD = { ready: false, user: null, db: null, auth: null, cfg: null, last: { shared: '', chars: {} }, unsub: [], saving: false, imported: 0 };
let LOCAL_DB = null; // exe: bu bilgisayardaki eski (yerel hesaplı) veri

const strip = o => JSON.parse(JSON.stringify(o ?? null));
function sharedForCloud() {
  const sh = { ...DB.shared };
  delete sh.gbMarket;
  return strip(sh);
}
const charMeta = ch => ({ name: ch.name, nation: ch.nation, cls: ch.cls, race: ch.race || '', level: ch.level, server: ch.server || '', clan: ch.clan || '', note: ch.note || '', created: ch.created || '' });

async function cloudConfig() {
  // exe: program kendi içinden alır (tarayıcı CORS kısıtı yok, son ayar diskte saklı)
  const url = serverMode ? '/api/siteconfig' : '/api/kohesap/config';
  const r = await fetch(url, { cache: 'no-store' });
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
  try {
    CLOUD.db = FB.initializeFirestore(app, { localCache: FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }) });
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
  const [mainSnap, charSnap] = await Promise.all([FB.getDoc(mainRef), FB.getDocs(FB.collection(CLOUD.db, 'kohesap', uid, 'chars'))]);
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
  CLOUD.last.shared = mainSnap.exists() ? JSON.stringify(sharedForCloud()) + '|' + JSON.stringify(CUR.acc.chars.map(c => c.id)) : '';
  CLOUD.last.chars = {};
  if (!CLOUD.imported) CUR.acc.chars.forEach(c => { CLOUD.last.chars[c.id] = JSON.stringify({ ...charMeta(c), data: c.data }); });
  CLOUD.user = user;
  if (!mainSnap.exists()) await cloudSave(true);
  watchRemote(uid);
}

/* ---------- kaydetme ---------- */
async function cloudSave(force) {
  if (!CLOUD.user || !DB || !CUR.acc) return;
  const uid = CLOUD.user.uid;
  const batch = FB.writeBatch(CLOUD.db);
  let n = 0;
  const ids = CUR.acc.chars.map(c => c.id);
  const shJSON = JSON.stringify(sharedForCloud()) + '|' + JSON.stringify(ids);
  if (force || shJSON !== CLOUD.last.shared) {
    batch.set(FB.doc(CLOUD.db, 'kohesap', uid), { shared: sharedForCloud(), charIds: ids, updatedAt: FB.serverTimestamp(), app: serverMode ? 'exe' : 'web' });
    n++;
  }
  const nextChars = {};
  for (const ch of CUR.acc.chars) {
    const body = { ...charMeta(ch), data: strip(ch.data) };
    const j = JSON.stringify(body);
    nextChars[ch.id] = j;
    if (j.length > 900000) { toast(`${ch.name}: kayıtlar çok büyüdü (${Math.round(j.length / 1024)} KB). Eski kayıtları dışa aktarıp temizleyin.`, 'err'); continue; }
    if (force || j !== CLOUD.last.chars[ch.id]) { batch.set(FB.doc(CLOUD.db, 'kohesap', uid, 'chars', ch.id), { ...body, updatedAt: FB.serverTimestamp() }); n++; }
  }
  for (const id of Object.keys(CLOUD.last.chars)) if (!nextChars[id]) { batch.delete(FB.doc(CLOUD.db, 'kohesap', uid, 'chars', id)); n++; }
  if (!n) return;
  CLOUD.saving = true;
  try {
    await batch.commit();
    CLOUD.last.shared = shJSON;
    CLOUD.last.chars = nextChars;
  } finally { CLOUD.saving = false; }
}

/* ---------- başka cihazdan gelen değişiklikler ---------- */
function watchRemote(uid) {
  CLOUD.unsub.forEach(f => f()); CLOUD.unsub = [];
  CLOUD.unsub.push(FB.onSnapshot(FB.doc(CLOUD.db, 'kohesap', uid), snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites || saveTimer || CLOUD.saving) return;
    const m = snap.data();
    const j = JSON.stringify(strip(m.shared)) + '|' + JSON.stringify(m.charIds || []);
    if (j === CLOUD.last.shared) return;
    const gb = DB.shared.gbMarket;
    DB.shared = migrateDB({ v: 2, shared: m.shared, accounts: [] }).shared;
    DB.shared.gbMarket = gb;
    CLOUD.last.shared = JSON.stringify(sharedForCloud()) + '|' + JSON.stringify(m.charIds || []);
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
        if (CUR.acc.chars.some(c => c.id === id)) { CUR.acc.chars = CUR.acc.chars.filter(c => c.id !== id); delete CLOUD.last.chars[id]; changed = true; }
        return;
      }
      const d = ch.doc.data();
      const body = { ...charMeta(d), data: d.data };
      const j = JSON.stringify(body);
      if (j === CLOUD.last.chars[id]) return;
      let c = CUR.acc.chars.find(x => x.id === id);
      if (!c) { if (CUR.acc.chars.length >= MAX_CHARS) return; c = { id }; CUR.acc.chars.push(c); }
      Object.assign(c, charMeta(d));
      c.data = Object.assign(newCharData(c.level), d.data || {});
      CLOUD.last.chars[id] = j;
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
    el.innerHTML = `<a class="side-dl" href="/downloads/KOHesap.exe" download>${ICON.dl}<span>Windows uygulamasını indir<small>aynı Google hesabıyla senkron</small></span></a>`;
  } else if (CLOUD.cfg && CLOUD.cfg.exeVersion && versionNewer(CLOUD.cfg.exeVersion, cur)) {
    el.innerHTML = `<a class="side-dl new" href="${SITE}${CLOUD.cfg.exeUrl || '/downloads/KOHesap.exe'}" target="_blank" rel="noopener">${ICON.dl}<span>Yeni sürüm: v${esc(CLOUD.cfg.exeVersion)}<small>indirip eskisinin yerine koy</small></span></a>`;
  } else el.innerHTML = '';
}
