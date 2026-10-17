'use strict';
/* ==========================================================================
   GİRİŞ EKRANI, HESAPLAR VE KARAKTERLER
   Her hesapta en fazla 4 karakter; kayıtlar karakter bazında tutulur.
   ========================================================================== */

const MAX_CHARS = 4;
const trLowA = s => String(s || '').trim().toLocaleLowerCase('tr');
// son girilen karakter (cihaz bazında)
const lastCharKey = () => 'kohesap-lastchar-' + (CLOUD.user ? CLOUD.user.uid : '');
function rememberChar(id) { try { id ? localStorage.setItem(lastCharKey(), id) : localStorage.removeItem(lastCharKey()); } catch { } }
function rememberedChar() { try { return localStorage.getItem(lastCharKey()); } catch { return null; } }

/* ---------- amblemler ---------- */
const CLASS_GLYPH = {
  warrior: '<path d="M19 4.5l-9.5 9.5"/><path d="M15 4.5h4.5V9"/><path d="M6.5 12.5l5 5"/><path d="M4.5 19.5l4-4"/>',
  rogue: '<path d="M6 4c7 2.5 11.5 7 14 14"/><path d="M6 4l14 14"/><path d="M4 20l6.5-6.5"/><path d="M4 20h4M4 20v-4"/>',
  mage: '<path d="M12 3.5l2.3 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.8 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  priest: '<path d="M12 4v16"/><path d="M7 9h10"/><path d="M8.5 4.5c1-.9 2.2-1.3 3.5-1.3s2.5.4 3.5 1.3"/>',
  kurian: '<path d="M12 3.5l7.5 2.8v5.6c0 4.3-3.2 7.5-7.5 8.6-4.3-1.1-7.5-4.3-7.5-8.6V6.3z"/><path d="M9.5 9l1 5.5M12 8.5v6.5M14.5 9l-1 5.5"/>',
};
function charEmblem(ch, size = 44) {
  const n = NATIONS[ch.nation] || NATIONS.karus, c = CLASSES[ch.cls] || CLASSES.warrior;
  return `<span class="emblem" style="width:${size}px;height:${size}px;--nc:${n.color};--cc:${c.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:${Math.round(size * 0.56)}px;height:${Math.round(size * 0.56)}px">${CLASS_GLYPH[ch.cls] || CLASS_GLYPH.warrior}</svg></span>`;
}
const charLine = ch => `Lv ${ch.level} · ${jobTitle(ch)} · ${(NATIONS[ch.nation] || {}).label || ''}${ch.server ? ' · ' + ch.server : ''}`;

/* ---------- resmi sınıf görseli (yüklenmezse amblem kalır) ---------- */
function artImg(ch) {
  const src = charArtSrc(ch), direct = src.includes('h=ntt');
  return `<img src="${src.startsWith('data:') ? src : esc(src)}" data-d="${direct ? esc(classArt(ch.cls, ch.nation)) : ''}" alt="${esc(classLabel(ch.cls, ch.nation))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="iconFail(this)">`;
}
function charArt(ch, cls = '') {
  return `<div class="art ${cls}"><span class="art-fb">${charEmblem(ch, 84)}</span>${artImg(ch)}</div>`;
}
/** Yuvarlak karakter fotoğrafı (sınıf görselinin yüz kısmı); yüklenmezse amblem görünür. */
function charAvatar(ch, size = 40) {
  const n = NATIONS[ch.nation] || NATIONS.karus;
  const face = charFaceSrc(ch);
  return `<span class="cav" style="--s:${size}px;--nc:${n.color}"><span class="cav-fb">${charEmblem(ch, size)}</span>${face
    ? `<img class="face" src="${esc(face)}" alt="" decoding="async" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">` : artImg(ch)}</span>`;
}
/** Bir karakterin verisi üzerinde geçici olarak hesap yapar (seçim ekranı / ekip kartı için). */
function withChar(ch, fn) {
  const prev = CUR.ch; CUR.ch = ch; bindView();
  try { return fn(); } finally { CUR.ch = prev; bindView(); }
}
function charSummary(ch) {
  return withChar(ch, () => {
    const m = monthSummary(localDate().slice(0, 7));
    const c = S.exp.calc || {};
    return { net: m.net, count: m.count, exp: Math.max(0, Math.min(100, +c.cur || 0)), parties: S.parties.length, trades: S.trades.length };
  });
}
const agoDay = iso => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'bugün' : d === 1 ? 'dün' : d < 30 ? d + ' gün önce' : new Date(iso).toLocaleDateString('tr-TR');
};
function newServerBanner() {
  const ms = new Date(NEW_SERVER.open).getTime() - Date.now();
  if (ms <= -7 * 864e5) return '';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5);
  return `<div class="ns-banner"><b>Yeni sunucular</b><span>12 Kasım 16:00 · başlangıç level cap ${NEW_SERVER.cap}</span><span class="ns-cd">${ms > 0 ? `${d} gün ${h} saat kaldı` : 'açıldı'}</span></div>`;
}

/* ---------- ekran yönetimi ---------- */
const auth = { mode: 'login', err: '', busy: false };
function authEl() {
  let el = $('#auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  return el;
}
function showAuth(mode, err = '') {
  auth.mode = mode; auth.err = err;
  const el = authEl();
  el.hidden = false;
  document.querySelector('.app').style.visibility = 'hidden';
  el.innerHTML = `<div class="auth-bg"></div><div class="auth-wrap">${AUTH_VIEWS[mode]()}</div><div class="auth-foot">KO Hesap ${esc($('#ver').textContent)} · forgeandplay.com · kayıtların Google hesabınla tüm cihazlarında</div>`;
  // imleç yalnızca form ilk açıldığında ad kutusuna gider (sınıf/ırk değişince yazılan yer kaymasın)
  const f = el.querySelector('input:not([type=checkbox])');
  if (f && mode === 'charForm' && auth.lastMode !== 'charForm') setTimeout(() => { if (!el.contains(document.activeElement) || document.activeElement === document.body) f.focus(); }, 30);
  if (f && mode === 'invite' && auth.lastMode !== 'invite') setTimeout(() => f.focus(), 30);
  auth.lastMode = mode;
}
function hideAuth() {
  const el = authEl();
  el.hidden = true; el.innerHTML = '';
  document.querySelector('.app').style.visibility = '';
}
async function startAuth() {
  showAuth('loading');
  try { await cloudInit(); }
  catch (e) { return showAuth('offline', e.message); }
  let first = true;
  FB.onAuthStateChanged(CLOUD.auth, async user => {
    if (!user) { CLOUD.user = null; CUR.acc = null; CUR.ch = null; accessStop(); bindView(); return showAuth('login'); }
    if (CLOUD.user && CLOUD.user.uid === user.uid) return;
    showAuth('loading');
    // davetle giriş: erişimi olmayan kullanıcı davet kodu ekranında bekler (access.js)
    if (!(await accessGate(user))) return;
    try { await cloudLoad(user); }
    catch (e) { return showAuth('offline', 'Kayıtların yüklenemedi: ' + e.message); }
    sideExtra();
    artLoad();
    if (CLOUD.imported) toast(`Bu bilgisayardaki ${CLOUD.imported} karakter Google hesabına aktarıldı`, 'ok');
    const last = rememberedChar();
    const ch = CUR.acc.chars.find(c => c.id === last);
    if (ch && first) enterChar(ch);
    else if (!CUR.acc.chars.length) openCharForm(null);
    else showAuth('chars');
    first = false;
  });
}
function enterChar(ch) {
  CUR.ch = ch;
  ch.played = new Date().toISOString();
  rememberChar(ch.id);
  bindView();
  if (ch.server) {
    S.settings.server = ch.server;
    if (S.gbMarket && typeof applyGB === 'function') applyGB();
  }
  if (!S.exp.calc.level || S.exp.calc.level < ch.level) S.exp.calc.level = ch.level;
  ui.page = 'panel'; ui.partyId = null; ui.newDrop = null;
  if (typeof MK !== 'undefined' && serverMode) { MK.items = []; MK.err = ''; MK.server = 'all'; }
  hideAuth(); save(); render();
  toast(`Hoş geldin, ${ch.name}`, 'ok');
}
async function logout() {
  rememberChar(null);
  CUR.acc = null; CUR.ch = null;
  closeModal();
  await cloudSignOut();
  bindView();
  showAuth('login');
}

/* ---------- görünümler ---------- */
const brandBlock = (sub) => `<div class="auth-brand"><img src="icon.svg" width="52" height="52" alt=""><div><div class="auth-title">KO Hesap</div><div class="auth-sub">${sub}</div></div></div>`;
const errLine = () => auth.err ? `<div class="auth-err">${esc(auth.err)}</div>` : '';
const AUTH_VIEWS = {
  loading: () => `<div class="auth-card" style="align-items:center;text-align:center">${brandBlock('Knight Online gelir · gider · hesap defteri')}<div class="spinner"></div><div class="mut">Bağlanılıyor…</div></div>`,
  offline: () => `<div class="auth-card">
      ${brandBlock('Bağlantı kurulamadı')}
      <div class="auth-err">${esc(auth.err)}</div>
      <div class="mut" style="font-size:13px">KO Hesap kayıtlarını Google hesabında saklar; ilk giriş için internet bağlantısı gerekir.</div>
      <button class="btn pri auth-btn" data-act="au-retry">Tekrar dene</button>
    </div>`,
  login: () => `<div class="auth-card">
      ${brandBlock('Knight Online gelir · gider · hesap defteri')}
      <ul class="auth-feats">
        <li>Hesap başına 4 karakter, her birinin kayıtları ayrı</li>
        <li>Gelir / gider, item ticareti, parti drop ve pay dağılımı</li>
        <li>Canlı GB fiyatları, PUS ve EXP hesabı, event takvimi</li>
        <li>Web ve Windows uygulaması aynı kayıtları kullanır</li>
        <li>Davetle çalışır: giriş için yöneticinin verdiği davet kodu gerekir</li>
      </ul>
      ${errLine()}
      <button class="btn auth-google" data-act="au-google" ${auth.busy ? 'disabled' : ''}>
        <svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        ${auth.busy ? 'Google penceresi açık…' : 'Google ile giriş yap'}
      </button>
      <div class="auth-alt">Giriş yaparak forgeandplay.com <a href="${serverMode ? SITE : ''}/tr/kullanim-sartlari" target="_blank" rel="noopener">kullanım şartlarını</a> kabul etmiş olursun.</div>
    </div>`,
  chars: () => {
    const acc = CUR.acc;
    const slots = Array.from({ length: MAX_CHARS }, (_, i) => acc.chars[i]);
    const slot = (ch, i) => {
      if (!ch) return `<button class="slot empty" data-act="char-new"><span class="slot-plus">${ICON.plus}</span><b>Karakter oluştur</b><span class="mut">Boş yuva ${i + 1}</span></button>`;
      const n = NATIONS[ch.nation] || NATIONS.karus, c = CLASSES[ch.cls] || CLASSES.warrior, sm = charSummary(ch);
      return `<div class="slot filled" style="--nc:${n.color};--cc:${c.color}" data-act="char-play" data-id="${ch.id}" role="button" tabindex="0" aria-label="${esc(ch.name)} ile gir">
        ${charArt(ch, 'slot-art')}
        <div class="slot-tools"><button class="icon-btn" data-act="char-edit" data-id="${ch.id}" title="Düzenle">${ICON.edit}</button><button class="icon-btn danger" data-act="char-del" data-id="${ch.id}" title="Sil">${ICON.del}</button></div>
        <span class="slot-nat">${esc(n.label)}</span>
        <div class="slot-info">
          <div class="slot-title" lang="en">${esc(jobTitle(ch))}</div>
          <div class="slot-name">${esc(ch.name)}</div>
          <div class="slot-sub"><b>Lv ${ch.level}</b>${ch.server ? ' · ' + esc(ch.server) : ''}${ch.race ? ' · ' + esc(ch.race) : ''}${ch.cls === 'rogue' ? ' · ' + ROGUE_TYPES[ch.rtype === 'asas' ? 'asas' : 'okcu'] : ''}</div>
          ${ch.clan ? `<div class="slot-clan">${esc(ch.clan)}</div>` : ''}
          <div class="slot-exp" title="Seviye ilerlemesi"><i style="width:${sm.exp}%"></i></div>
          <div class="slot-kv"><span>%${nf2.format(sm.exp)} EXP</span><span class="${sm.net > 0 ? 'pos' : sm.net < 0 ? 'neg' : ''}">Bu ay ${sm.net ? (sm.net > 0 ? '+' : '') + fmtShort(sm.net) : '—'}</span></div>
          <div class="slot-foot"><span>${ch.played ? 'Son giriş ' + agoDay(ch.played) : 'Henüz girilmedi'}</span><span class="slot-enter">Gir ›</span></div>
        </div>
      </div>`;
    };
    return `<div class="auth-chars">
      <div class="row chars-head">
        ${brandBlock('Karakter seç')}
        <span class="spacer"></span>
        ${CLOUD.user && CLOUD.user.photoURL ? `<img src="${esc(CLOUD.user.photoURL)}" width="28" height="28" style="border-radius:50%" alt="" referrerpolicy="no-referrer">` : ''}
        <span class="mut"><b style="color:var(--tx)">${esc(acc.name || acc.user)}</b><br><small>${esc(acc.user)}</small></span>
        <button class="btn ghost" data-act="logout">Çıkış</button>
      </div>
      ${newServerBanner()}
      <div class="slots">${slots.map(slot).join('')}</div>
      <div class="hint chars-hint">${acc.chars.length}/${MAX_CHARS} yuva dolu · karta dokun ve gir</div>
    </div>`;
  },
  charForm: () => {
    const f = auth.cf;
    const isNew = !f.id;
    const servers = [...new Set([...(S.gbMarket ? S.gbMarket.servers : []), ...DEFAULT_SERVERS, ...(f.server ? [f.server] : [])])];
    const races = raceOptions(f.nation, f.cls);
    if (!races.includes(f.race)) f.race = races[0];
    const lv = Math.round(parseNum(f.level)) || 1;
    const preview = { ...f, name: f.name || 'Karakter adı', level: lv, master: f.master !== false };
    const c = CLASSES[f.cls], side = classSide(f.cls, f.nation), n = NATIONS[f.nation];
    return `<form class="auth-chars" data-auth-form="char" onsubmit="return false">
      <div class="row chars-head">
        ${brandBlock(isNew ? 'Yeni karakter' : 'Karakteri düzenle')}
        <span class="spacer"></span>
        <button class="btn ghost" data-act="au-mode" data-v="chars">← Karakterlere dön</button>
      </div>
      <div class="cf-grid">
        <div class="stack" style="gap:18px">
          <div><div class="cf-lbl">Ulus</div><div class="nation-pick">${Object.entries(NATIONS).map(([k, nn]) => `
            <button type="button" class="nation ${f.nation === k ? 'on' : ''}" style="--nc:${nn.color}" data-act="cf-set" data-k="nation" data-v="${k}"><b>${nn.label}</b><span>${k === 'karus' ? 'Tuarek ırkları' : 'Barbarian ve El Moradian'}</span></button>`).join('')}</div></div>
          <div><div class="cf-lbl">Sınıf</div><div class="class-pick">${Object.entries(CLASSES).map(([k, cc]) => `
            <button type="button" class="cls ${f.cls === k ? 'on' : ''}" style="--cc:${cc.color};--nc:${n.color}" data-act="cf-set" data-k="cls" data-v="${k}">${charArt({ nation: f.nation, cls: k, race: k === f.cls ? f.race : '', rtype: k === f.cls ? f.rtype : 'okcu' }, 'cls-art')}<span>${esc(classLabel(k, f.nation))}</span></button>`).join('')}</div></div>
          <div class="cls-info"><div><span>Rol</span><b>${esc(c.role)}</b></div><div><span>Ana stat</span><b>${esc(c.stat)}</b></div><div><span>Ekipman</span><b>${esc(c.gear)}</b></div><div><span>Meslek yolu</span><b>${esc(classLabel(f.cls, f.nation))} → ${esc(side.job)} (10) → ${esc(side.master)} (60)</b></div></div>
          <div class="cf-two"><div><div class="cf-lbl">Irk</div><div class="chips">${races.map(r => `<button type="button" class="chip ${r === f.race ? 'on' : ''}" data-act="cf-set" data-k="race" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>
          ${f.cls === 'rogue' ? `<div><div class="cf-lbl">Rogue tipi</div><div class="chips">${Object.entries(ROGUE_TYPES).map(([k, l]) => `<button type="button" class="chip ${(f.rtype || 'okcu') === k ? 'on' : ''}" data-act="cf-set" data-k="rtype" data-v="${k}">${l}</button>`).join('')}</div></div>` : ''}</div>
          <div class="form">
            <label class="f">Karakter adı<input class="inp" id="cf-name" data-cf="name" value="${esc(f.name)}" maxlength="21" placeholder="Oyundaki adın"></label>
            <label class="f">Seviye<input class="inp num" data-cf="level" value="${esc(f.level)}" inputmode="numeric" placeholder="1–83"></label>
            <label class="f">Sunucu<select class="inp" data-cf="server">${servers.map(sv => `<option ${sv === f.server ? 'selected' : ''}>${esc(sv)}</option>`).join('')}</select><span class="hint">Yeni sunucu adı açıklanınca listeye eklenir; Ayarlar'dan da yazabilirsin.</span></label>
            <label class="f">Klan (isteğe bağlı)<input class="inp" data-cf="clan" value="${esc(f.clan)}" maxlength="21"></label>
            <label class="f full check" data-master-row ${lv >= 60 ? '' : 'hidden'}><input type="checkbox" data-cf-chk="master" ${f.master !== false ? 'checked' : ''}> Master görevi tamamlandı (${esc(side.master)})</label>
            <label class="f full">Not (isteğe bağlı)<input class="inp" data-cf="note" value="${esc(f.note)}" placeholder="örn. farm karakteri, PK karakteri"></label>
          </div>
          ${isNew && DB.legacy && !CUR.acc.chars.length ? '<div class="callout y" style="font-size:12.5px">Önceki sürümdeki kayıtların bu karaktere aktarılacak.</div>' : ''}
          ${isNew && !CUR.acc.chars.length ? '<div class="hint">İlk karakterini oluştur. Daha sonra en fazla 4 karaktere kadar ekleyebilirsin.</div>' : ''}
          ${errLine()}
          <div class="row"><button class="btn pri" data-act="cf-save" style="min-width:180px;justify-content:center">${isNew ? 'Karakteri oluştur' : 'Kaydet'}</button></div>
        </div>
        <div class="cf-preview">
          <div class="slot filled preview" style="--nc:${n.color};--cc:${c.color}">
            ${charArt(preview, 'slot-art')}
            <span class="slot-nat">${esc(n.label)}</span>
            <div class="slot-info">
              <div class="slot-title" lang="en" data-prev-title>${esc(jobTitle(preview))}</div>
              <div class="slot-name" data-prev-name>${esc(preview.name)}</div>
              <div class="slot-sub"><b data-prev-lv>Lv ${esc(preview.level)}</b> · ${esc(f.server)} · ${esc(f.race || '')}</div>
            </div>
          </div>
        </div>
      </div>
    </form>`;
  },
};

/* ---------- işlemler ---------- */
function openCharForm(ch) {
  auth.cf = ch ? { id: ch.id, name: ch.name, nation: ch.nation, cls: ch.cls, race: RACE_FIX[ch.race] || ch.race, level: ch.level, server: ch.server, clan: ch.clan || '', note: ch.note || '', master: ch.master !== false, rtype: ch.rtype || 'okcu' }
    : { name: '', nation: 'karus', cls: 'warrior', race: 'Arch Tuarek', level: 1, server: S.settings.server || DEFAULT_SERVERS[0], clan: '', note: '', master: true, rtype: 'okcu' };
  if (!$('#auth') || $('#auth').hidden) { authEl(); }
  showAuth('charForm');
}
function saveCharForm() {
  const f = auth.cf, acc = CUR.acc;
  f.name = f.name.trim();
  const level = Math.round(parseNum(f.level));
  if (!f.name) return showAuth('charForm', 'Karakter adı girin.');
  if (level < 1 || level > 83) return showAuth('charForm', 'Seviye 1 ile 83 arasında olmalı.');
  if (acc.chars.some(c => c.id !== f.id && trLowA(c.name) === trLowA(f.name))) return showAuth('charForm', 'Bu hesapta aynı isimde bir karakter var.');
  if (f.id) {
    const ch = acc.chars.find(c => c.id === f.id);
    Object.assign(ch, { name: f.name, nation: f.nation, cls: f.cls, race: f.race, level, server: f.server, clan: f.clan.trim(), note: f.note.trim(), master: f.master !== false, rtype: f.rtype || 'okcu' });
    save();
    if (CUR.ch === ch && auth.returnToApp) { auth.returnToApp = false; enterChar(ch); return; }
    return showAuth('chars');
  }
  if (acc.chars.length >= MAX_CHARS) return showAuth('charForm', 'Bir hesapta en fazla 4 karakter olabilir.');
  const ch = { id: uid(), name: f.name, nation: f.nation, cls: f.cls, race: f.race, level, server: f.server, clan: f.clan.trim(), note: f.note.trim(), master: f.master !== false, rtype: f.rtype || 'okcu', created: new Date().toISOString(), data: newCharData(level) };
  if (DB.legacy && !acc.chars.length) { ch.data = DB.legacy; DB.legacy = null; }
  acc.chars.push(ch);
  save();
  enterChar(ch);
}

Object.assign(ACTIONS, {
  'au-mode': el => { if (el.dataset.v === 'chars') auth.returnToApp = false; showAuth(el.dataset.v); },
  'au-retry': () => { CLOUD.ready = false; startAuth(); },
  'au-google': async () => {
    auth.busy = true; showAuth('login');
    try { await cloudSignIn(); auth.busy = false; }
    catch (e) {
      auth.busy = false;
      const msg = /popup-closed|cancelled-popup/.test(e.code || '') ? '' : /popup-blocked/.test(e.code || '') ? 'Açılır pencere engellendi; tarayıcıda bu site için açılır pencerelere izin ver.' : /unauthorized-domain/.test(e.code || '') ? 'Bu adres Firebase\'de yetkili alan değil (Authentication → Settings → Authorized domains).' : 'Giriş yapılamadı: ' + (e.code || e.message);
      showAuth('login', msg);
    }
  },
  'char-new': () => { if (CUR.acc.chars.length < MAX_CHARS) openCharForm(null); },
  'char-play': el => enterChar(CUR.acc.chars.find(c => c.id === el.dataset.id)),
  'char-edit': el => openCharForm(CUR.acc.chars.find(c => c.id === el.dataset.id)),
  'char-edit-cur': () => { auth.returnToApp = true; openCharForm(CUR.ch); },
  'char-del': el => {
    const ch = CUR.acc.chars.find(c => c.id === el.dataset.id);
    confirmBox('Karakteri sil', `<b>${esc(ch.name)}</b> ve ona ait tüm kayıtlar (gelir/gider, ticaret, parti, PUS, EXP) kalıcı olarak silinecek. Günlük yedekler klasörde kalır.`, 'Karakteri sil', () => {
      CUR.acc.chars = CUR.acc.chars.filter(c => c !== ch);
      if (CUR.ch === ch) CUR.ch = null;
      save(); showAuth('chars');
    });
  },
  'char-select': () => { closeModal(); document.body.classList.remove('nav-open'); showAuth('chars'); },
  'cf-set': el => {
    readCharInputs(); auth.cf[el.dataset.k] = el.dataset.v;
    const f = auth.cf; if (el.dataset.k !== 'race' && el.dataset.k !== 'rtype') f.race = (RACE_DEFAULT[f.nation] || {})[f.cls] || '';
    showAuth('charForm');
  },
  'cf-save': () => { readCharInputs(); saveCharForm(); },
  logout: () => logout(),
  'acc-del': () => confirmBox('KO Hesap verilerini sil', `Google hesabına (<b>${esc(CUR.acc.user)}</b>) bağlı <b>${CUR.acc.chars.length} karakter ve tüm KO Hesap kayıtları</b> buluttan kalıcı olarak silinecek. Forge&Play hesabın silinmez.`, 'Verileri sil', async () => {
    try { await cloudDeleteAll(); CLOUD.last = { shared: '', chars: {} }; toast('KO Hesap verileri silindi', 'ok'); logout(); }
    catch (e) { toast('Silinemedi: ' + e.message, 'err'); }
  }),
});
function readCharInputs() {
  document.querySelectorAll('#auth [data-cf]').forEach(el => { auth.cf[el.dataset.cf] = el.value; });
  document.querySelectorAll('#auth [data-cf-chk]').forEach(el => { auth.cf[el.dataset.cfChk] = el.checked; });
}
document.addEventListener('input', e => {
  const d = e.target.dataset;
  if (d.cf && auth.cf) {
    auth.cf[d.cf] = e.target.value;
    if (d.cf === 'name') { const p = document.querySelector('[data-prev-name]'); if (p) p.textContent = e.target.value || 'Karakter adı'; }
    if (d.cf === 'level') {
      const p = document.querySelector('[data-prev-lv]'); if (p) p.textContent = 'Lv ' + (e.target.value || 1);
      const lvN = Math.round(parseNum(e.target.value)) || 1;
      const mr = document.querySelector('[data-master-row]'); if (mr) mr.hidden = lvN < 60;
      readCharInputs();
      const t = document.querySelector('[data-prev-title]'); if (t) t.textContent = jobTitle({ ...auth.cf, level: lvN });
    }
  }
});
document.addEventListener('change', e => {
  if (!auth.cf || !e.target.closest('#auth')) return;
  if (e.target.dataset.cf && e.target.tagName === 'SELECT') { readCharInputs(); showAuth('charForm', auth.err); }
  else if (e.target.dataset.cfChk) { readCharInputs(); const t = document.querySelector('[data-prev-title]'); if (t) t.textContent = jobTitle({ ...auth.cf, level: Math.round(parseNum(auth.cf.level)) || 1 }); }
});
// kart klavyeyle de seçilebilsin
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('slot') && e.target.dataset.act === 'char-play') { e.preventDefault(); e.target.click(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.closest('#auth')) return;
  const form = e.target.closest('[data-auth-form]'); if (!form) return;
  e.preventDefault();
  if (form.dataset.authForm === 'char') { readCharInputs(); saveCharForm(); }
});

/* ---------- kenar çubuğunda aktif karakter ---------- */
const _renderTicker = renderTicker;
renderTicker = function () {
  _renderTicker();
  const b = document.querySelector('.brand');
  if (!b) return;
  if (CUR.ch) {
    b.innerHTML = `${charAvatar(CUR.ch, 42)}<div style="min-width:0;flex:1"><div class="brand-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(CUR.ch.name)}</div><div class="brand-sub">Lv ${CUR.ch.level} · ${esc(jobTitle(CUR.ch))}${CUR.ch.server ? ' · ' + esc(CUR.ch.server) : ''}</div></div>`;
    b.dataset.act = 'char-select'; b.title = 'Karakter değiştir'; b.style.cursor = 'pointer';
  }
  sideExtra();
};
