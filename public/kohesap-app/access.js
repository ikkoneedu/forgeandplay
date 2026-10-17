'use strict';
/* ==========================================================================
   DAVETLE ERİŞİM
   forgeandplay.com'a herkes üye olabilir; KO Ekip'e yalnızca davet koduyla
   (ya da yöneticinin onayıyla) girilir. Kurallar Firestore'da da uygulanır:
     kohesapAdmin/invite      → { code }            yalnızca admin okur/yazar
     kohesapAccess/{uid}      → erişim kaydı         kullanıcı geçerli kodla kendisi oluşturur; admin yönetir
     kohesapRequests/{uid}    → erişim isteği        kodu olmayan kullanıcı bırakır; admin görür/onaylar
   Ekip (ve ses odası) kurmak yalnızca admine aittir.
   ========================================================================== */
const ACC = { ok: false, data: null, resolve: null, unsub: null, selfUnsub: null, rulesOld: false, err: '', busy: false,
  admin: { loaded: false, invite: null, users: [], reqs: [], unsubs: [] } };
const accRef = u => FB.doc(CLOUD.db, 'kohesapAccess', u);
const reqRef = u => FB.doc(CLOUD.db, 'kohesapRequests', u);
const inviteRef = () => FB.doc(CLOUD.db, 'kohesapAdmin', 'invite');
const emailAdmin = user => ADMIN_EMAILS.includes(String((user && user.email) || '').toLowerCase());
const accPerm = e => e && (e.code === 'permission-denied' || /insufficient permissions/i.test(e.message || ''));
const newCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; crypto.getRandomValues(new Uint8Array(8)).forEach(x => { s += a[x % a.length]; }); return s; };
const userCard = user => ({ email: String(user.email || '').slice(0, 120), name: String(user.displayName || '').slice(0, 60), photo: String(user.photoURL || '').slice(0, 500) });

/** Giriş kapısı: erişim varsa hemen true; yoksa davet ekranını gösterir ve erişim gelene kadar bekler. */
async function accessGate(user) {
  accessStop();
  ACC.ok = false; ACC.data = null; ACC.err = ''; ACC.rulesOld = false; ACC.user = user; ACC.selfSeen = false;
  if (emailAdmin(user)) {
    ACC.ok = true;
    // admin kendi kaydını da tutar (kullanıcı listesinde görünsün)
    FB.setDoc(accRef(user.uid), { ...userCard(user), at: Date.now(), code: 'admin', by: 'admin' }, { merge: true }).catch(() => { });
    return true;
  }
  try {
    const s = await FB.getDoc(accRef(user.uid));
    if (s.exists()) { ACC.ok = true; ACC.data = s.data(); accessWatchSelf(user); return true; }
  } catch (e) {
    if (accPerm(e)) ACC.rulesOld = true; else ACC.err = 'Bağlantı hatası: ' + e.message;
  }
  // erişim yok: yöneticiye istek bırak, kod ekranını göster, onay/kod gelene kadar bekle
  if (!ACC.rulesOld) FB.setDoc(reqRef(user.uid), { ...userCard(user), at: Date.now() }).catch(() => { });
  showAuth('invite');
  return new Promise(res => {
    ACC.resolve = res;
    if (ACC.rulesOld) return;
    try {
      ACC.unsub = FB.onSnapshot(accRef(user.uid), s => {
        if (s.exists() && ACC.resolve) { ACC.ok = true; ACC.data = s.data(); const r = ACC.resolve; ACC.resolve = null; stopGateWatch(); accessWatchSelf(user); toast('KO Ekip erişimin açıldı', 'ok'); showAuth('loading'); r(true); }
      }, () => { });
    } catch { }
  });
}
function stopGateWatch() { if (ACC.unsub) { try { ACC.unsub(); } catch { } ACC.unsub = null; } }
function accessStop() {
  stopGateWatch();
  if (ACC.selfUnsub) { try { ACC.selfUnsub(); } catch { } ACC.selfUnsub = null; }
  if (ACC.resolve) { const r = ACC.resolve; ACC.resolve = null; r(false); }
  ACC.admin.unsubs.splice(0).forEach(f => { try { f(); } catch { } }); ACC.admin.loaded = false;
}
/* uygulama içindeyken: yönetici ekibe eklerse ekibe geç, erişimi kaldırırsa çık */
function accessWatchSelf(user) {
  if (ACC.selfUnsub || emailAdmin(user)) return;
  ACC.selfUnsub = FB.onSnapshot(accRef(user.uid), s => {
    // yalnızca daha önce görülen kayıt silinirse çıkış (anlık önbellek boşluğunda kimse atılmasın)
    if (!s.exists()) { if (ACC.ok && ACC.selfSeen && !(s.metadata && s.metadata.fromCache)) { ACC.ok = false; toast('KO Ekip erişimin yönetici tarafından kaldırıldı', 'err'); setTimeout(() => logout(), 1500); } return; }
    ACC.selfSeen = true;
    ACC.data = s.data();
    const t = ACC.data.team;
    if (t && DB && DB.shared && !DB.shared.teamCode && CUR.acc) { DB.shared.teamCode = t; save(); if (typeof teamWatch === 'function') teamWatch(); toast('Yönetici seni ekibe ekledi', 'ok'); }
  }, () => { });
}
/* son görülme ve karakter özeti (admin kullanıcı listesinde görür) */
function accessTouch() {
  if (!CLOUD.user || emailAdmin(CLOUD.user) || !ACC.ok) return;
  const chars = (CUR.acc ? CUR.acc.chars : []).map(c => ({ name: c.name, cls: c.cls, nation: c.nation, race: c.race || '', rtype: c.rtype || 'okcu', level: +c.level || 1 }));
  FB.setDoc(accRef(CLOUD.user.uid), { seen: Date.now(), ...userCard(CLOUD.user), chars }, { merge: true }).catch(() => { });
}
const _enterCharA = enterChar;
enterChar = function (ch) { _enterCharA(ch); accessTouch(); };

/* ---------- davet ekranı ---------- */
AUTH_VIEWS.invite = () => {
  const u = ACC.user || {};
  return `<div class="auth-card invite-card">
    ${brandBlock('Davetle giriş')}
    ${ACC.rulesOld ? `<div class="auth-err">KO Ekip güncelleniyor: yöneticinin yeni Firebase kurallarını yayınlaması gerekiyor. Yöneticiye haber ver.</div>` : `
    <p class="mut" style="margin:0;font-size:13.5px">KO Ekip yalnızca davetli ekip içindir. Yöneticinin verdiği <b>davet kodunu</b> gir. Kodun yoksa bekle: isteğin yöneticiye iletildi, onaylanınca bu ekran kendiliğinden açılır.</p>
    <form class="invite-form" data-auth-form="invite" onsubmit="return false">
      <input class="inp invite-inp" id="inviteCode" maxlength="12" placeholder="DAVET KODU" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="btn pri auth-btn" data-act="acc-redeem" ${ACC.busy ? 'disabled' : ''}>${ACC.busy ? 'Kontrol ediliyor…' : 'Giriş yap'}</button>
    </form>
    ${ACC.err ? `<div class="auth-err">${esc(ACC.err)}</div>` : ''}
    <div class="invite-wait"><span class="vdot"></span> Onay bekleniyor · ${esc(u.email || '')}</div>`}
    <button class="btn ghost" data-act="logout" style="align-self:center">Farklı hesapla gir / çıkış</button>
  </div>`;
};
async function accessRedeem() {
  const inp = document.getElementById('inviteCode');
  const code = String(inp ? inp.value : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) { ACC.err = 'Davet kodu en az 6 karakter.'; return showAuth('invite'); }
  const user = ACC.user; if (!user) return;
  ACC.busy = true; ACC.err = ''; showAuth('invite');
  try {
    await FB.setDoc(accRef(user.uid), { ...userCard(user), at: Date.now(), code });
    FB.deleteDoc(reqRef(user.uid)).catch(() => { });
    ACC.busy = false; ACC.ok = true;
    if (ACC.resolve) { const r = ACC.resolve; ACC.resolve = null; stopGateWatch(); accessWatchSelf(user); showAuth('loading'); r(true); }
  } catch (e) {
    ACC.busy = false;
    ACC.err = accPerm(e) ? 'Davet kodu geçersiz. Yöneticiden güncel kodu iste.' : 'Bağlantı hatası: ' + e.message;
    showAuth('invite');
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'inviteCode') { e.preventDefault(); accessRedeem(); } });

/* ---------- admin: kullanıcılar ve davet kodu (Ayarlar) ---------- */
function accessAdminLoad() {
  const A = ACC.admin; if (A.loaded || !isAdmin() || !CLOUD.db) return;
  A.loaded = true;
  const err = e => { A.err = accPerm(e) ? 'Yeni Firebase kuralları yayınlanmamış.' : e.message; if (accPerm(e) && typeof TEAM !== 'undefined') TEAM.rulesMissing = true; repaintUsers(); };
  A.unsubs.push(FB.onSnapshot(inviteRef(), s => { A.invite = s.exists() ? s.data() : null; repaintUsers(); }, err));
  A.unsubs.push(FB.onSnapshot(FB.collection(CLOUD.db, 'kohesapAccess'), s => { const l = []; s.forEach(d => l.push({ uid: d.id, ...d.data() })); A.users = l; repaintUsers(); }, err));
  A.unsubs.push(FB.onSnapshot(FB.collection(CLOUD.db, 'kohesapRequests'), s => { const l = []; s.forEach(d => l.push({ uid: d.id, ...d.data() })); A.reqs = l; repaintUsers(); }, err));
}
function repaintUsers() { const el = document.querySelector('.users-card'); if (el) el.outerHTML = usersCard(); }
const fmtAgo = t => { if (!t) return '—'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'şimdi' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' sa önce' : Math.round(m / 1440) + ' gün önce'; };
function usersCard() {
  const A = ACC.admin, me = myUid();
  const users = [...A.users].sort((a, b) => (b.code === 'admin') - (a.code === 'admin') || (b.seen || b.at || 0) - (a.seen || a.at || 0));
  const has = new Set(users.map(u => u.uid));
  const reqs = A.reqs.filter(r => !has.has(r.uid)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const teamIds = new Set(TEAM.doc ? TEAM.doc.memberUids || [] : []);
  const myTeam = TEAM.doc && TEAM.doc.owner === me;
  const code = A.invite && A.invite.code;
  return `<div class="card users-card">
    <div class="card-h"><div><h3>Kullanıcılar ve davet <span class="badge y">admin</span></h3><div class="sub">KO Ekip'e yalnızca bu listedekiler girebilir. Yeni kişiyi davet kodu ile ya da isteğini onaylayarak eklersin.</div></div></div>
    ${A.err ? `<div class="callout r" style="margin-bottom:12px">${esc(A.err)}</div>` : ''}
    <div class="invite-box">
      <div><span class="mut">Davet kodu</span><b class="invite-code">${code ? esc(code) : '—'}</b></div>
      <span class="spacer"></span>
      ${code ? `<button class="btn sm" data-act="acc-copy">${ICON.copy} Davet metnini kopyala</button>` : ''}
      <button class="btn sm ${code ? 'ghost' : 'pri'}" data-act="acc-newcode">${code ? 'Kodu yenile' : 'Davet kodu oluştur'}</button>
    </div>
    <div class="hint" style="margin:6px 0 14px">Kodu yenilersen eski kod artık çalışmaz; zaten girmiş olanların erişimi devam eder.</div>
    ${reqs.length ? `<h4 class="users-h">Onay bekleyenler <span class="badge r">${reqs.length}</span></h4>
    <div class="users-list">${reqs.map(r => `<div class="user-row req">
      ${r.photo ? `<img class="u-ph" src="${esc(r.photo)}" alt="" referrerpolicy="no-referrer">` : '<span class="u-ph"></span>'}
      <div class="u-tx"><b>${esc(r.name || r.email)}</b><span>${esc(r.email)} · ${fmtAgo(r.at)}</span></div>
      <button class="btn sm pri" data-act="acc-approve" data-uid="${esc(r.uid)}">Onayla</button>
      <button class="btn sm ghost" data-act="acc-reject" data-uid="${esc(r.uid)}">Reddet</button>
    </div>`).join('')}</div>` : ''}
    <h4 class="users-h">Erişimi olanlar <span class="badge">${users.length}</span></h4>
    <div class="users-list">${users.map(u => {
      const isMe = u.uid === me, inTeam = teamIds.has(u.uid);
      return `<div class="user-row">
        ${u.photo ? `<img class="u-ph" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : '<span class="u-ph"></span>'}
        <div class="u-tx"><b>${esc(u.name || u.email)} ${u.code === 'admin' ? '<span class="badge y">admin</span>' : ''} ${inTeam ? '<span class="badge g">ekipte</span>' : ''}</b>
          <span>${esc(u.email || '')} · son giriş ${fmtAgo(u.seen || u.at)}${u.code && u.code !== 'admin' ? ` · ${u.code === 'onay' ? 'onayla eklendi' : 'kodla girdi'}` : ''}</span>
          ${(u.chars || []).length ? `<span class="u-chars">${u.chars.map(c => `<i>${charAvatar(c, 20)}${esc(c.name)} <b>${c.level}</b></i>`).join('')}</span>` : ''}</div>
        ${!isMe && myTeam && !inTeam ? `<button class="btn sm" data-act="acc-team" data-uid="${esc(u.uid)}">Ekibe ekle</button>` : ''}
        ${!isMe ? `<button class="btn sm ghost danger" data-act="acc-revoke" data-uid="${esc(u.uid)}">Erişimi kaldır</button>` : ''}
      </div>`;
    }).join('') || '<div class="mut" style="padding:10px">Henüz kimse yok.</div>'}</div>
  </div>`;
}
const _ayarView = VIEWS.ayar;
VIEWS.ayar = () => {
  if (isAdmin()) { setTimeout(accessAdminLoad, 0); return usersCard() + _ayarView(); }
  return _ayarView();
};
Object.assign(ACTIONS, {
  'acc-redeem': () => accessRedeem(),
  'acc-newcode': () => {
    const go = () => FB.setDoc(inviteRef(), { code: newCode(), at: Date.now() }).then(() => toast('Yeni davet kodu oluşturuldu', 'ok')).catch(e => toast(accPerm(e) ? 'Kaydedilemedi: Firebase kuralları yayınlanmamış' : e.message, 'err'));
    ACC.admin.invite && ACC.admin.invite.code ? confirmBox('Davet kodunu yenile', 'Eski kod artık çalışmayacak. Erişimi olanlar etkilenmez.', 'Yenile', go) : go();
  },
  'acc-copy': () => {
    const txt = `KO Ekip davet kodu: ${ACC.admin.invite.code}\nforgeandplay.com → Google ile giriş yap → kodu gir.`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Davet metni kopyalandı', 'ok')).catch(() => toast(ACC.admin.invite.code));
  },
  'acc-approve': el => {
    const r = ACC.admin.reqs.find(x => x.uid === el.dataset.uid); if (!r) return;
    FB.setDoc(accRef(r.uid), { email: r.email || '', name: r.name || '', photo: r.photo || '', at: Date.now(), code: 'onay', by: CLOUD.user.email })
      .then(() => { FB.deleteDoc(reqRef(r.uid)).catch(() => { }); toast(`${r.name || r.email} onaylandı`, 'ok'); })
      .catch(e => toast(e.message, 'err'));
  },
  'acc-reject': el => FB.deleteDoc(reqRef(el.dataset.uid)).then(() => toast('İstek silindi')).catch(e => toast(e.message, 'err')),
  'acc-revoke': el => {
    const u = ACC.admin.users.find(x => x.uid === el.dataset.uid); if (!u) return;
    confirmBox('Erişimi kaldır', `<b>${esc(u.name || u.email)}</b> artık KO Ekip'e giremeyecek${TEAM.doc && (TEAM.doc.memberUids || []).includes(u.uid) ? ' ve ekipten çıkarılacak' : ''}. Kayıtları silinmez; tekrar eklersen geri gelir.`, 'Erişimi kaldır', async () => {
      try {
        if (TEAM.doc && TEAM.doc.owner === myUid() && (TEAM.doc.memberUids || []).includes(u.uid)) await teamKick(u.uid);
        await FB.deleteDoc(accRef(u.uid));
        toast('Erişim kaldırıldı', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });
  },
  'acc-team': async el => {
    const u = ACC.admin.users.find(x => x.uid === el.dataset.uid); if (!u || !TEAM.doc) return;
    try {
      await FB.runTransaction(CLOUD.db, async tx => {
        const snap = await tx.get(teamRef(TEAM.code)); const d = snap.data(), ids = d.memberUids || [];
        if (ids.includes(u.uid)) return;
        if (ids.length >= TEAM_MAX) throw new Error(`Ekip dolu (${TEAM_MAX}/${TEAM_MAX}).`);
        tx.update(teamRef(TEAM.code), { memberUids: [...ids, u.uid], ['members.' + u.uid]: { name: u.name || u.email, photo: u.photo || '', main: '', chars: (u.chars || []).map((c, i) => ({ id: 'c' + i, ...c, server: '', clan: '', master: true, exp: 0 })), updated: new Date().toISOString() }, updatedAt: FB.serverTimestamp() });
      });
      await FB.setDoc(accRef(u.uid), { team: TEAM.code }, { merge: true });
      toast(`${u.name || u.email} ekibe eklendi`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  },
});
