'use strict';
/* ==========================================================================
   EKİP (en fazla 8 kişi)
   Firestore: kohesapTeams/{kod} → { name, owner, memberUids[], members{uid: özet}, createdAt, updatedAt }
   Üyeler birbirinin yalnızca karakter özetini görür (ad, sınıf, seviye, sunucu,
   klan, EXP %). Gelir/gider ve diğer kayıtlar paylaşılmaz.
   ========================================================================== */
const TEAM_MAX = 8;
const TEAM = { doc: null, code: '', unsub: null, err: '', busy: false, lastSig: '', loaded: false };
const teamRef = code => FB.doc(CLOUD.db, 'kohesapTeams', code);
const myUid = () => CLOUD.user && CLOUD.user.uid;
const teamCodeOf = () => (DB.shared && DB.shared.teamCode) || '';
const newTeamCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(8)); r.forEach(x => { s += a[x % a.length]; }); return s; };

function myTeamEntry() {
  const u = CLOUD.user, acc = CUR.acc || { chars: [] };
  const mainId = (DB.shared.teamMain && acc.chars.some(c => c.id === DB.shared.teamMain)) ? DB.shared.teamMain : (CUR.ch ? CUR.ch.id : (acc.chars[0] || {}).id || '');
  return {
    name: (u.displayName || (u.email || '').split('@')[0] || 'Oyuncu').slice(0, 40),
    photo: u.photoURL || '',
    main: mainId,
    chars: acc.chars.map(c => ({ id: c.id, name: c.name, cls: c.cls, nation: c.nation, race: c.race || '', level: +c.level || 1, server: c.server || '', clan: c.clan || '', master: c.master !== false, rtype: c.rtype || 'okcu', exp: Math.round((+(c.data && c.data.exp && c.data.exp.calc && c.data.exp.calc.cur) || 0) * 100) / 100 })),
    updated: new Date().toISOString(),
  };
}
const entrySig = e => JSON.stringify({ ...e, updated: '', cs: 0 });

/* ---------- Firebase kuralları yayınlanmış mı? ---------- */
const isPermErr = e => e && (e.code === 'permission-denied' || /insufficient permissions/i.test(e.message || ''));
async function teamRulesProbe() {
  if (TEAM.rulesChecked || !CLOUD.db || !myUid()) return;
  TEAM.rulesChecked = true;
  try { await FB.getDoc(teamRef('KURALCHK')); await FB.getDoc(FB.doc(CLOUD.db, 'kohesapAssets', 'classArt')); TEAM.rulesMissing = false; }
  catch (e) { TEAM.rulesMissing = isPermErr(e); }
  if (ui.page === 'ekip') render();
}
function rulesBox() {
  if (!TEAM.rulesMissing) return '';
  const pid = (CLOUD.cfg && CLOUD.cfg.firebase && CLOUD.cfg.firebase.projectId) || '';
  if (!isAdmin()) return `<div class="callout r" style="margin-bottom:16px"><b>Ekip özelliği henüz açılmadı.</b> Sunucu tarafındaki izin ayarı (Firebase kuralları) güncellenmemiş. Site yöneticisine haber ver.</div>`;
  return `<div class="card rules-box">
    <div class="card-h"><div><h3>Güncel Firebase kurallarını yayınla <span class="badge y">admin</span></h3>
      <div class="sub">Bu sürümün kuralları Firebase'de henüz yayınlanmamış; ekip, sesli sohbet veya karakter görselleri "izin yok" hatası verebilir. Kurallar Vercel ile otomatik gitmez; her güncellemede bir kez elle yapıştırman gerekiyor.</div></div></div>
    <ol class="rules-steps">
      <li><button class="btn pri sm" data-act="rules-copy">Kuralları kopyala</button> (repodaki <code>firestore.rules</code> dosyasının tamamı)</li>
      <li>${pid ? `<a class="btn sm" href="https://console.firebase.google.com/project/${esc(pid)}/firestore/rules" target="_blank" rel="noopener">Firebase kural sayfasını aç ↗</a>` : 'Firebase Console → Firestore Database → Rules sekmesini aç'}</li>
      <li>Oradaki metnin tamamını sil, kopyaladığını yapıştır ve <b>Publish</b> de.</li>
      <li><button class="btn sm ghost" data-act="rules-recheck">Tekrar kontrol et</button></li>
    </ol>
  </div>`;
}

/* ---------- canlı izleme ---------- */
function teamWatch() {
  if (TEAM.unsub) { TEAM.unsub(); TEAM.unsub = null; }
  TEAM.code = teamCodeOf(); TEAM.doc = null; TEAM.loaded = false;
  if (!TEAM.code || !CLOUD.db || !myUid()) { TEAM.loaded = true; return; }
  TEAM.unsub = FB.onSnapshot(teamRef(TEAM.code), snap => {
    TEAM.loaded = true;
    const d = snap.exists() ? snap.data() : null;
    if (!d || !(d.memberUids || []).includes(myUid())) {
      // ekip silindi ya da ekipten çıkarıldın
      if (TEAM.doc) toast(d ? 'Ekipten çıkarıldın' : 'Ekip kapatıldı', 'err');
      TEAM.doc = null; DB.shared.teamCode = ''; save();
      if (TEAM.unsub) { TEAM.unsub(); TEAM.unsub = null; }
    } else {
      TEAM.doc = d;
      teamSyncSoon();
    }
    if (ui.page === 'ekip') render();
    if (ui.page === 'ses' && typeof chatPaint === 'function') chatPaint(); // okundu tikleri
    if (ui.page === 'ayar' && typeof repaintUsers === 'function') repaintUsers();
  }, err => { TEAM.loaded = true; TEAM.err = err.message; if (ui.page === 'ekip') render(); });
}
let teamSyncTimer = null;
function teamSyncSoon() { clearTimeout(teamSyncTimer); teamSyncTimer = setTimeout(teamSync, 1500); }
async function teamSync(force) {
  if (!TEAM.doc || !myUid()) return;
  const e = myTeamEntry(), sig = entrySig(e);
  const remote = (TEAM.doc.members || {})[myUid()];
  if (!force && (sig === TEAM.lastSig || (remote && entrySig(remote) === sig))) { TEAM.lastSig = sig; return; }
  TEAM.lastSig = sig;
  try { await FB.setDoc(teamRef(TEAM.code), { members: { [myUid()]: e }, updatedAt: FB.serverTimestamp() }, { merge: true }); }
  catch (err) { console.warn('ekip eşitleme', err); }
}
setInterval(() => { if (TEAM.doc) teamSync(); }, 30000);

/* ---------- işlemler ---------- */
async function teamCreate(name) {
  const code = newTeamCode(), uidv = myUid();
  await FB.setDoc(teamRef(code), { name: name.slice(0, 40), owner: uidv, memberUids: [uidv], members: { [uidv]: myTeamEntry() }, createdAt: FB.serverTimestamp(), updatedAt: FB.serverTimestamp() });
  DB.shared.teamCode = code; save(); teamWatch();
}
async function teamJoin(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new Error('Ekip kodu 8 karakter olmalı.');
  const uidv = myUid();
  await FB.runTransaction(CLOUD.db, async tx => {
    const snap = await tx.get(teamRef(code));
    if (!snap.exists()) throw new Error('Bu kodla bir ekip bulunamadı.');
    const d = snap.data(), ids = d.memberUids || [];
    if (ids.includes(uidv)) return;
    if (ids.length >= TEAM_MAX) throw new Error(`Ekip dolu (${TEAM_MAX}/${TEAM_MAX}).`);
    tx.update(teamRef(code), { memberUids: [...ids, uidv], ['members.' + uidv]: myTeamEntry(), updatedAt: FB.serverTimestamp() });
  });
  DB.shared.teamCode = code; save(); teamWatch();
}
async function teamLeave() {
  const code = TEAM.code, uidv = myUid();
  await FB.runTransaction(CLOUD.db, async tx => {
    const snap = await tx.get(teamRef(code));
    if (!snap.exists()) return;
    const d = snap.data(), rest = (d.memberUids || []).filter(x => x !== uidv);
    if (d.owner === uidv) {
      if (!rest.length) { tx.delete(teamRef(code)); return; }
      tx.update(teamRef(code), { owner: rest[0], memberUids: rest, ['members.' + uidv]: FB.deleteField(), updatedAt: FB.serverTimestamp() });
    } else tx.update(teamRef(code), { memberUids: rest, ['members.' + uidv]: FB.deleteField(), updatedAt: FB.serverTimestamp() });
  });
  if (TEAM.unsub) { TEAM.unsub(); TEAM.unsub = null; }
  TEAM.doc = null; DB.shared.teamCode = ''; save();
}
async function teamKick(target) {
  const code = TEAM.code;
  await FB.runTransaction(CLOUD.db, async tx => {
    const snap = await tx.get(teamRef(code));
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.owner !== myUid()) throw new Error('Yalnızca ekip lideri üye çıkarabilir.');
    tx.update(teamRef(code), { memberUids: (d.memberUids || []).filter(x => x !== target), ['members.' + target]: FB.deleteField(), updatedAt: FB.serverTimestamp() });
  });
}
async function teamRename(name) { await FB.setDoc(teamRef(TEAM.code), { name: name.slice(0, 40), updatedAt: FB.serverTimestamp() }, { merge: true }); }

/* ---------- yardımcılar ---------- */
function teamMembers() {
  const d = TEAM.doc; if (!d) return [];
  return (d.memberUids || []).map(u => ({ uid: u, ...(d.members || {})[u] })).filter(m => m.name)
    .map(m => ({ ...m, mainChar: (m.chars || []).find(c => c.id === m.main) || (m.chars || [])[0] || null }));
}
const teamMainName = m => m.mainChar ? m.mainChar.name : m.name;

/* ---------- sayfa ---------- */
PAGES.splice(PAGES.findIndex(p => p.id === 'parti') + 1, 0, { id: 'ekip', t: 'Ekip', d: '8 kişilik ekibin karakterleri, sınıf dağılımı ve parti' });
ICON.ekip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z"/><circle cx="12" cy="10" r="2.3"/><path d="M8.3 15.8c.8-1.6 2.1-2.4 3.7-2.4s2.9.8 3.7 2.4"/></svg>';

VIEWS.ekip = () => {
  if (!CLOUD.user) return `<div class="card">${empty('Giriş gerekli', 'Ekip özelliği Google hesabıyla çalışır.')}</div>`;
  if (!TEAM.rulesChecked) setTimeout(teamRulesProbe, 0);
  return rulesBox() + ekipBody();
};
function ekipBody() {
  if (teamCodeOf() && !TEAM.loaded) return `<div class="card">${empty('Ekip yükleniyor…', '')}</div>`;
  if (!TEAM.doc) return `
    <div class="grid g2 team-start">
      ${(isAdmin() || (typeof featOk === 'function' && featOk('ekipkur'))) ? `<div class="card">
        <div class="card-h"><h3>Ekip kur ${isAdmin() ? '<span class="badge y">admin</span>' : ''}</h3></div>
        <p class="mut" style="margin:0 0 14px;font-size:13.5px">Bir ekip kur, 8 karakterlik kodu arkadaşlarına gönder. Ekibe katılan herkesin karakterleri (sınıf, seviye, sunucu, klan, EXP) burada görünür; parti açarken tek dokunuşla üye listesi dolar.</p>
        <div class="form"><label class="f full">Ekip adı<input class="inp" id="teamName" maxlength="40" placeholder="örn. Gece Farmcıları"></label></div>
        <button class="btn pri" style="margin-top:12px" data-act="team-create" ${TEAM.busy ? 'disabled' : ''}>${ICON.plus} Ekip kur</button>
      </div>` : `<div class="card">
        <div class="card-h"><h3>Ekip</h3></div>
        ${typeof featTier === 'function' && featTier('ekipkur') === 'vip'
          ? `<p class="mut" style="margin:0;font-size:13.5px">Ekip kurmak VIP üyelere açık. Bir ekip liderinden kod aldıysan yandaki kutuya gir.</p><button class="btn pri" style="margin-top:12px" data-act="go" data-id="vip">VIP ayrıcalıklarını gör</button>`
          : `<p class="mut" style="margin:0;font-size:13.5px">Ekipler ve ses odası yönetici tarafından kurulur. Yönetici seni ekibe eklediğinde bu sayfa kendiliğinden açılır; ya da ondan aldığın ekip kodunu yandaki kutuya gir.</p>`}
      </div>`}
      <div class="card">
        <div class="card-h"><h3>Ekibe katıl</h3></div>
        <p class="mut" style="margin:0 0 14px;font-size:13.5px">Ekip liderinin gönderdiği kodu gir. Bir ekipte en fazla ${TEAM_MAX} kişi olabilir.</p>
        <div class="form"><label class="f full">Ekip kodu<input class="inp team-code-inp" id="teamJoin" maxlength="9" placeholder="ABCD2345" autocapitalize="characters" autocomplete="off"></label></div>
        <button class="btn pri" style="margin-top:12px" data-act="team-join" ${TEAM.busy ? 'disabled' : ''}>Katıl</button>
      </div>
    </div>
    <div class="hint" style="margin-top:12px">Gizlilik: ekip üyeleri yalnızca karakter bilgilerini görür. Gelir, gider, ticaret ve diğer kayıtların sende kalır.</div>`;

  const d = TEAM.doc, me = myUid(), isOwner = d.owner === me, members = teamMembers();
  const mains = members.map(m => m.mainChar).filter(Boolean);
  const clsCount = Object.keys(CLASSES).map(k => [k, mains.filter(c => c.cls === k).length]);
  const avgLv = mains.length ? sum(mains, c => c.level) / mains.length : 0;
  const tips = [];
  if (mains.length && !mains.some(c => c.cls === 'priest')) tips.push('Ana karakterler arasında Priest yok; farm ve savaşta en az bir Priest önerilir.');
  if (mains.length >= 4 && !mains.some(c => c.cls === 'warrior' || c.cls === 'kurian')) tips.push('Ön safta Warrior veya Kurian/Portu yok.');
  const servers = [...new Set(mains.map(c => c.server).filter(Boolean))];
  if (servers.length > 1) tips.push('Ana karakterler farklı sunucularda: ' + servers.join(', ') + '.');
  const myEntry = members.find(m => m.uid === me);
  const memberCard = m => {
    const mc = m.mainChar;
    const n = mc ? NATIONS[mc.nation] || NATIONS.karus : NATIONS.karus, c = mc ? CLASSES[mc.cls] || CLASSES.warrior : CLASSES.warrior;
    return `<div class="tm-card" style="--nc:${n.color};--cc:${c.color}">
      ${mc ? charArt(mc, 'tm-art') : '<div class="tm-art art"></div>'}
      <div class="tm-body">
        <div class="tm-who">${mc ? charAvatar(mc, 24) : m.photo ? `<img src="${esc(m.photo)}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(m.name)}</span>${m.uid === d.owner ? '<span class="badge y">Lider</span>' : ''}${m.uid === me ? '<span class="badge b">Sen</span>' : ''}
          ${isOwner && m.uid !== me ? `<button class="icon-btn danger tm-kick" data-act="team-kick" data-uid="${esc(m.uid)}" title="Ekipten çıkar">${ICON.del}</button>` : ''}</div>
        ${mc ? `<div class="slot-title" lang="en">${esc(jobTitle(mc))}</div>
        <div class="tm-name">${esc(mc.name)}</div>
        <div class="slot-sub"><b>Lv ${mc.level}</b> · ${esc(n.label)}${mc.server ? ' · ' + esc(mc.server) : ''}${mc.clan ? ' · ' + esc(mc.clan) : ''}</div>
        <div class="slot-exp"><i style="width:${Math.min(100, mc.exp || 0)}%"></i></div>
        <div class="slot-kv"><span>%${nf2.format(mc.exp || 0)} EXP</span><span>${esc(mc.race || '')}</span></div>` : '<div class="mut">Henüz karakter yok</div>'}
        ${(m.chars || []).length > 1 ? `<div class="tm-alts">${m.chars.filter(x => !mc || x.id !== mc.id).map(x => `<span title="${esc(jobTitle(x))}">${charAvatar(x, 20)}${esc(x.name)} <b>${x.level}</b></span>`).join('')}</div>` : ''}
        <div class="tm-upd">${m.updated ? 'Güncellendi ' + agoDay(m.updated) : ''}</div>
      </div>
    </div>`;
  };
  return `
  <div class="card team-head">
    <div class="team-title">
      <div><span class="mut">Ekip</span><h2>${esc(d.name || 'Ekip')}</h2></div>
      <div class="team-code"><span class="mut">Davet kodu</span><b>${esc(TEAM.code)}</b><button class="btn sm" data-act="team-copy">${ICON.copy} Kopyala</button></div>
    </div>
    <div class="team-stats">
      <div><span>Üye</span><b>${members.length}/${TEAM_MAX}</b></div>
      <div><span>Ortalama seviye</span><b>${avgLv ? nf2.format(avgLv) : '—'}</b></div>
      ${clsCount.map(([k, v]) => `<div class="tc" style="--cc:${CLASSES[k].color}"><span>${esc(k === 'kurian' ? 'Kurian/Portu' : CLASSES[k].label)}</span><b>${v}</b></div>`).join('')}
    </div>
    ${tips.length ? `<div class="callout y" style="margin-top:12px">${tips.map(esc).join('<br>')}</div>` : ''}
    <div class="row team-actions">
      ${myEntry && CUR.acc.chars.length > 1 ? `<label class="f" style="min-width:220px">Ekipte görünen ana karakterim<select class="inp" data-team-main>${CUR.acc.chars.map(c => `<option value="${c.id}" ${myEntry.main === c.id ? 'selected' : ''}>${esc(c.name)} · Lv ${c.level} ${esc(jobTitle(c))}</option>`).join('')}</select></label>` : ''}
      <span class="spacer"></span>
      <button class="btn pri" data-act="party-from-team">${ICON.plus} Ekiple parti aç</button>
      ${isOwner ? '<button class="btn ghost" data-act="team-rename">Adı değiştir</button>' : ''}
      <button class="btn ghost danger" data-act="team-leave">Ekipten ayrıl</button>
    </div>
  </div>
  <div class="tm-grid">${members.map(memberCard).join('')}${Array.from({ length: Math.max(0, TEAM_MAX - members.length) }, (_, i) => `<div class="tm-card empty"><div class="slot-plus">${ICON.plus}</div><b>Boş yer</b><span class="mut">Kodu paylaş: ${esc(TEAM.code)}</span></div>`).join('')}</div>
  <div class="hint" style="margin-top:12px">Ekip üyeleri yalnızca karakter bilgilerini görür; gelir, gider ve ticaret kayıtları paylaşılmaz. Bilgiler her girişte ve değişiklikte kendiliğinden güncellenir.</div>`;
}

/* ---------- parti: ekipten doldur ---------- */
function partyFromTeam() {
  const members = teamMembers().slice(0, TEAM_MAX);
  if (!members.length) return toast('Ekipte üye yok', 'err');
  const list = members.map(m => ({ id: uid(), name: teamMainName(m), weight: 1, me: m.uid === myUid() }));
  if (!list.some(x => x.me)) list[0].me = true;
  const p = { id: uid(), name: (TEAM.doc.name || 'Ekip') + ' partisi', date: localDate(), place: '', members: list, drops: [], leaderId: '', leaderPct: 0, feePct: 0, costs: 0, costPayer: '', status: 'acik', note: '' };
  S.parties.push(p); ui.partyId = p.id; ui.page = 'parti'; save(); render();
  toast(`${list.length} kişilik parti ekipten oluşturuldu`, 'ok');
}

Object.assign(ACTIONS, {
  'team-create': async () => {
    if (!isAdmin() && !(typeof featOk === 'function' && featOk('ekipkur'))) return toast(typeof featTier === 'function' && featTier('ekipkur') === 'vip' ? 'Ekip kurmak VIP üyelere açık' : 'Ekipleri yalnızca yönetici kurabilir', 'err');
    const name = ($('#teamName') || {}).value || '';
    if (!name.trim()) return toast('Ekip adı girin', 'err');
    TEAM.busy = true; render();
    try { await teamCreate(name.trim()); toast('Ekip kuruldu. Kodu arkadaşlarına gönder.', 'ok'); }
    catch (e) { if (isPermErr(e)) { TEAM.rulesMissing = true; toast('Ekip kurulamadı: Firebase kuralları yayınlanmamış', 'err'); } else toast('Ekip kurulamadı: ' + e.message, 'err'); }
    TEAM.busy = false; render();
  },
  'team-join': async () => {
    const code = ($('#teamJoin') || {}).value || '';
    TEAM.busy = true; render();
    try { await teamJoin(code); toast('Ekibe katıldın', 'ok'); }
    catch (e) { if (isPermErr(e)) { TEAM.rulesMissing = true; toast('Katılınamadı: Firebase kuralları yayınlanmamış', 'err'); } else toast(e.message, 'err'); }
    TEAM.busy = false; render();
  },
  'team-copy': () => {
    const txt = `KO Ekip ekibimize katıl: "${TEAM.doc.name}" · kod ${TEAM.code} · forgeandplay.com → Ekip → Ekibe katıl`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Davet metni kopyalandı', 'ok')).catch(() => toast(TEAM.code));
  },
  'team-leave': () => confirmBox('Ekipten ayrıl', `<b>${esc(TEAM.doc.name)}</b> ekibinden ayrılacaksın.${TEAM.doc.owner === myUid() ? ' Liderlik sıradaki üyeye geçer; tek kişiysen ekip kapanır.' : ''}`, 'Ayrıl', () => {
    teamLeave().then(() => { toast('Ekipten ayrıldın', 'ok'); render(); }).catch(e => toast('Ayrılamadın: ' + e.message, 'err'));
  }),
  'team-kick': el => {
    const m = teamMembers().find(x => x.uid === el.dataset.uid); if (!m) return;
    confirmBox('Üyeyi çıkar', `<b>${esc(m.name)}</b> (${esc(teamMainName(m))}) ekipten çıkarılsın mı?`, 'Çıkar', () => teamKick(m.uid).then(() => toast('Üye çıkarıldı', 'ok')).catch(e => toast(e.message, 'err')));
  },
  'team-rename': () => openForm({ title: 'Ekip adı', fields: [{ k: 'name', label: 'Ekip adı', type: 'text', full: true }], data: { name: TEAM.doc.name || '' },
    onSave: v => { if (!v.name.trim()) return false; teamRename(v.name.trim()).then(() => toast('Ekip adı güncellendi', 'ok')).catch(e => toast(e.message, 'err')); } }),
  'party-from-team': () => partyFromTeam(),
  'rules-copy': async () => {
    try {
      const txt = await (await fetch('firestore.rules.txt', { cache: 'no-store' })).text();
      await navigator.clipboard.writeText(txt);
      toast('Kurallar kopyalandı (' + txt.split('\n').length + ' satır). Firebase\'e yapıştır.', 'ok');
    } catch (e) { toast('Kopyalanamadı: ' + e.message, 'err'); }
  },
  'rules-recheck': () => { TEAM.rulesChecked = false; TEAM.rulesMissing = false; teamRulesProbe().then(() => { toast(TEAM.rulesMissing ? 'Kurallar hâlâ eski görünüyor' : 'Kurallar yayınlanmış, her şey hazır', TEAM.rulesMissing ? 'err' : 'ok'); if (!TEAM.rulesMissing) artLoad(); render(); }); },
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.teamMain != null) { DB.shared.teamMain = e.target.value; save(); teamSync(true); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'teamJoin') ACTIONS['team-join']();
  if (e.target.id === 'teamName') ACTIONS['team-create']();
});

/* parti sayfasında "Ekipten doldur" (ekip varsa) */
const _partiView = VIEWS.parti;
VIEWS.parti = () => {
  let html = _partiView();
  if (TEAM.doc) html = html.replace(`data-act="party-new">${ICON.plus} Yeni parti</button>`, `data-act="party-new">${ICON.plus} Yeni parti</button><button class="btn" style="width:100%;justify-content:center;margin:-4px 0 12px" data-act="party-from-team">Ekiple parti aç (${teamMembers().length})</button>`);
  return html;
};

/* karakter girişinde / çıkışında izlemeyi başlat */
const _enterChar = enterChar;
enterChar = function (ch) { _enterChar(ch); if (teamCodeOf() !== TEAM.code || !TEAM.unsub) teamWatch(); else teamSyncSoon(); };
const _logout = logout;
logout = async function () { if (TEAM.unsub) { TEAM.unsub(); TEAM.unsub = null; } TEAM.doc = null; TEAM.code = ''; return _logout(); };
