'use strict';
/* ==========================================================================
   KO Ekip — üyelik planı (Üye / VIP) ve süperadmin yönetimi
   config/plan (admin yazar, giriş yapan herkes okur):
     { on, signup: 'acik'|'onay'|'davet', price, teamVip, features: { <id>: 'uye'|'vip'|'kapali' }, note }
   kohesapAccess/{uid}.vipUntil (ms) : VIP bitiş zamanı — yalnızca admin yazar
   kohesapAccess/{uid}.vipReq   (ms) : kullanıcının "VIP olmak istiyorum" isteği
   Sistem kapalıyken (on=false) her şey bugünkü gibi çalışır: tüm özellikler üyelere açık,
   ekip kurmak yalnızca admin. Aynı kurallar sunucuda (API) ve Firestore kurallarında da uygulanır.
   ========================================================================== */
const FEATS = [
  { g: 'Ekip' },
  { id: 'ekip', n: 'Ekip sayfası', d: '8 kişilik ekip, karakterler, sınıf dağılımı', def: 'uye' },
  { id: 'ekipkur', n: 'Ekip kurma', d: 'Kendi ekibini kurup arkadaşlarını davet etme', def: 'uye', sub: true },
  { id: 'ses', n: 'Ekip yazışması', d: 'Ekip sohbeti ve bot (Ses & Sohbet sayfası)', def: 'uye' },
  { id: 'sesli', n: 'Sesli ekip odası', d: 'Bas-konuş, telefon ve PC arasında sesli oda', def: 'vip', sub: true },
  { id: 'planla', n: 'Ekip planı', d: 'Etkinlik planlama, katılım ve hatırlatma', def: 'uye' },
  { id: 'gunluk', n: 'Günlük görevler', d: 'Karakter başına günlük / haftalık yapılacaklar', def: 'uye' },
  { id: 'boss', n: 'Boss alarmı', d: 'Sunucuya göre boss sayaçları, ekip içinde paylaşılır', def: 'uye' },
  { id: 'event', n: 'Event takvimi', d: 'Haftalık event saatleri ve geri sayım', def: 'uye' },
  { id: 'yeni', n: 'Yeni sunucu haberleri', d: 'Geri sayım, resmî takvim ve canlı haberler', def: 'uye' },
  { id: 'bildirim', n: 'Telefon bildirimleri', d: 'Event / boss / ekip bildirimleri', def: 'uye' },
  { g: 'Defter' },
  { id: 'panel', n: 'Panel', d: 'Aylık özet', def: 'uye' },
  { id: 'kasa', n: 'Gelir / Gider', d: 'Para hareketleri', def: 'uye' },
  { id: 'ticaret', n: 'Item ticareti', d: 'Alış – satış ve kâr takibi', def: 'uye' },
  { id: 'parti', n: 'Parti & Drop', d: 'Drop ve pay dağılımı', def: 'uye' },
  { g: 'Canlı veri' },
  { id: 'gb', n: 'Canlı GB fiyatları', d: 'Sitelerin sunucu bazında GB alış / satış fiyatları', def: 'vip' },
  { id: 'pazar', n: 'Canlı pazar', d: 'Oyundaki pazar ilanları', def: 'vip' },
  { id: 'ilan', n: 'Site ilanları', d: 'Item ve karakter ilanları, sunucuya göre', def: 'vip' },
  { g: 'Hesaplayıcılar' },
  { id: 'pus', n: 'PUS hesabı', d: 'KC → TL → GB maliyeti', def: 'uye' },
  { id: 'exp', n: 'EXP hesabı', d: 'Seviye aralığı, süre ve maliyet', def: 'uye' },
  { id: 'basma', n: 'Item basma', d: 'Örs simülasyonu, maliyet, günlük', def: 'uye' },
  { id: 'fiyat', n: 'Fiyat listesi', d: 'Kendi item fiyat listen', def: 'uye' },
];
const FEAT = Object.fromEntries(FEATS.filter(f => f.id).map(f => [f.id, f]));
const TIER_TR = { uye: 'Üye', vip: 'VIP', kapali: 'Kapalı' };
const PLAN_DEF = { on: false, signup: 'onay', price: 125, teamVip: true, features: {}, note: '' };
const PLAN = { d: { ...PLAN_DEF }, loaded: false, unsub: null, err: '' };
const planRef = () => FB.doc(CLOUD.db, 'config', 'plan');
const VIP_FOREVER = 4102444800000; // 2100

function planSet(d) {
  PLAN.d = { ...PLAN_DEF, ...(d || {}), features: { ...((d && d.features) || {}) } };
  PLAN.loaded = true;
}
function featTier(id) {
  if (!PLAN.d.on) return id === 'ekipkur' ? 'kapali' : 'uye';
  const t = PLAN.d.features[id] || (FEAT[id] && FEAT[id].def) || 'uye';
  return TIER_TR[t] ? t : 'uye';
}
const vipUntil = () => isAdmin() ? VIP_FOREVER : +((typeof ACC !== 'undefined' && ACC.data && ACC.data.vipUntil) || 0);
const planVip = () => vipUntil() > Date.now();
/** ekip VIP'i: lider VIP ise (ya da ekip adminin) ekipteki herkes sesli odayı kullanır */
const teamShareVip = () => !!(PLAN.d.teamVip && typeof TEAM !== 'undefined' && TEAM.doc && +(TEAM.doc.ownerVip || 0) > Date.now());
function featOk(id) {
  if (isAdmin()) return true;
  const t = featTier(id);
  if (t === 'uye') return true;
  if (t === 'vip') return planVip() || (id === 'sesli' && teamShareVip());
  return false;
}
const daysLeft = until => Math.max(0, Math.ceil((until - Date.now()) / 864e5));
const fmtDay = ms => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

/* ---------- plan belgesini izle ---------- */
function planWatch() {
  if (PLAN.unsub || !CLOUD.db) return;
  try {
    PLAN.unsub = FB.onSnapshot(planRef(), s => { planSet(s.exists() ? s.data() : null); PLAN.err = ''; if (CUR.ch) render(); },
      e => { PLAN.err = accPerm(e) ? 'rules' : e.message; planSet(null); });
  } catch { }
}
function planStop() { if (PLAN.unsub) { try { PLAN.unsub(); } catch { } PLAN.unsub = null; } }

/* ---------- açık kayıt: Google ile gelen herkes üye olur (admin "açık" seçtiyse) ---------- */
const _accessGateP = accessGate;
accessGate = async function (user) {
  if (user && !emailAdmin(user)) {
    try {
      const s = await FB.getDoc(accRef(user.uid));
      if (!s.exists()) {
        const p = await FB.getDoc(planRef()).catch(() => null);
        if (p && p.exists() && p.data().signup === 'acik') {
          await FB.setDoc(accRef(user.uid), { ...userCard(user), at: Date.now(), code: 'acik' });
          FB.deleteDoc(reqRef(user.uid)).catch(() => { });
          setTimeout(() => toast('KO Ekip\'e hoş geldin! Üyeliğin açıldı.', 'ok'), 600);
        }
      }
    } catch { /* eski kurallar: normal onay akışı */ }
  }
  const ok = await _accessGateP(user);
  if (ok) { try { localStorage.setItem('koekip.in', '1'); localStorage.setItem('koekip.name', String((user && (user.displayName || user.email)) || '').slice(0, 40)); localStorage.setItem('koekip.photo', String((user && user.photoURL) || '').slice(0, 400)); } catch { } planWatch(); }
  return ok;
};
const _logoutP = logout;
logout = async function () { try { ['koekip.in', 'koekip.name', 'koekip.photo'].forEach(k => localStorage.removeItem(k)); } catch { } planStop(); planSet(null); return _logoutP.apply(this, arguments); };

/* ---------- sayfa kilitleri ---------- */
ICON.vip = I('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>');
ICON.lock = I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
const vipPerks = () => FEATS.filter(f => f.id && featTier(f.id) === 'vip');
function lockedView(id) {
  const f = FEAT[id] || { n: (PAGES.find(p => p.id === id) || {}).t || 'Bu özellik' };
  if (featTier(id) === 'kapali') return `<div class="card pl-lock-card">${empty('Bu özellik şu an kapalı', 'Yönetici bu özelliği geçici olarak kapattı.')}</div>`;
  return `<div class="card pl-lock-card">
    <div class="pl-crown">${ICON.vip}</div>
    <h3>${esc(f.n)} VIP üyelere özel</h3>
    <p class="mut">${esc(f.d || '')}</p>
    ${planPriceBox()}
    <div class="pl-cta"><button class="btn pri" data-act="go" data-id="vip">${ICON.vip} VIP ayrıcalıklarını gör</button></div>
  </div>`;
}
function planPriceBox() {
  return `<div class="pl-price"><b>${esc(String(PLAN.d.price || 125))} TL</b><span>/ ay</span></div>
    <div class="hint" style="text-align:center">Çevrim içi ödeme çok yakında. Şimdilik "VIP olmak istiyorum" de, yönetici seninle iletişime geçsin.</div>`;
}
const DISC = `<div class="pl-disc">ℹ️ Fiyat ve ilan bilgileri üçüncü taraf sitelerden otomatik alınır. KO Ekip bu verilerin doğruluğunu, güncelliğini ve sürekliliğini <b>garanti etmez</b>; kaynak site kapanır ya da erişimi keserse bu veri gelmeyebilir. Alım-satım kararlarını kendi kontrolünle ver.</div>`;
(function wrapViews() {
  Object.keys(VIEWS).forEach(id => {
    if (!FEAT[id]) return;
    const orig = VIEWS[id];
    VIEWS[id] = function () {
      if (!featOk(id)) return lockedView(id);
      const out = orig.apply(this, arguments);
      return ['gb', 'pazar', 'ilan'].includes(id) ? DISC + out : out;
    };
  });
  // sesli oda (Ses & Sohbet sayfasında): yazışma açık, katıl düğmesi VIP'e yönlendirir
  const sesV = VIEWS.ses;
  VIEWS.ses = function () {
    const out = sesV.apply(this, arguments);
    if (featOk('sesli') || !featOk('ses')) return out;
    const lbl = featTier('sesli') === 'kapali' ? 'Sesli oda şu an kapalı' : 'Sesli oda VIP · ayrıntılar';
    return out.replace(/<button class="btn pri vs-join"[^>]*>[\s\S]*?<\/button>/, `<button class="btn pri vs-join" data-act="go" data-id="vip">${ICON.lock} ${lbl}</button>`);
  };
  const vj = ACTIONS['v-join'];
  if (vj) ACTIONS['v-join'] = function () { if (!featOk('sesli')) { ui.page = 'vip'; return render(); } return vj.apply(this, arguments); };
})();

/* ---------- menü süsleri: VIP rozeti, kapalı sayfaları gizle ---------- */
ICON.home = I('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>');
/* Ana sayfa (tanıtım / güncel bilgiler): giriş yapmış hâlde açılır, oradan "Uygulamaya dön" ile geri gelinir */
function planHomeLink() {
  const nav = document.getElementById('nav'); if (!nav || nav.querySelector('.nav-home')) return;
  const href = (typeof IS_EXE !== 'undefined' && IS_EXE ? SITE : '') + '/?tanitim';
  nav.insertAdjacentHTML('afterbegin', `<a class="nav-btn nav-home" href="${href}"${typeof IS_EXE !== 'undefined' && IS_EXE ? ' target="_blank" rel="noopener"' : ''}>${ICON.home}<span>Ana sayfa</span><span class="pl-tag">site</span></a>`);
}
function planDecorate() {
  planHomeLink();
  const admin = isAdmin();
  document.querySelectorAll('#nav .nav-btn[data-id], #tabbar .tab[data-id]').forEach(b => {
    const id = b.dataset.id;
    if (id === 'vip') {
      if (!b.querySelector('.pl-tag') && b.closest('#nav')) {
        const u = vipUntil();
        b.insertAdjacentHTML('beforeend', admin ? '' : u > Date.now() ? `<span class="pl-tag on">${daysLeft(u)} gün</span>` : '');
      }
      return;
    }
    if (!FEAT[id]) return;
    const t = featTier(id);
    if (t === 'kapali' && !admin) { b.remove(); return; }
    if (b.closest('#nav') && !b.querySelector('.pl-tag') && t === 'vip') b.insertAdjacentHTML('beforeend', `<span class="pl-tag ${featOk(id) ? 'on' : ''}">${featOk(id) ? 'VIP' : ICON.lock + 'VIP'}</span>`);
    if (b.closest('#nav') && admin && t === 'kapali' && !b.querySelector('.pl-tag')) b.insertAdjacentHTML('beforeend', '<span class="pl-tag off">kapalı</span>');
  });
  planTeamMark();
}
/* ekip lideri: VIP durumunu ekip belgesine yazar (üyeler sesli odayı kullanabilsin; asıl kontrol kurallarda) */
let _ptmLast = '';
function planTeamMark() {
  if (typeof TEAM === 'undefined' || !TEAM.doc || !TEAM.code || TEAM.doc.owner !== myUid()) return;
  const want = planVip() ? vipUntil() : 0;
  const key = TEAM.code + ':' + want;
  if (+(TEAM.doc.ownerVip || 0) === want || _ptmLast === key) return;
  _ptmLast = key;
  FB.setDoc(teamRef(TEAM.code), { ownerVip: want }, { merge: true }).catch(() => { });
}
const _renderP = render;
render = function () { const r = _renderP.apply(this, arguments); try { planDecorate(); } catch (e) { console.warn('plan', e); } return r; };

/* ---------- VIP sayfası ---------- */
(function addPage() {
  const i = PAGES.findIndex(p => p.id === 'ayar');
  PAGES.splice(i < 0 ? PAGES.length : i, 0, { id: 'vip', t: 'VIP Üyelik', d: 'Üyelik durumun, VIP ayrıcalıkları ve fiyat' });
})();
VIEWS.vip = () => (isAdmin() ? (setTimeout(accessAdminLoad, 0), planAdminCard()) : '') + planMemberView();

function planMemberView() {
  const u = vipUntil(), vip = u > Date.now(), req = ACC.data && ACC.data.vipReq;
  const perks = FEATS.filter(f => f.id);
  const row = f => {
    const t = featTier(f.id);
    if (t === 'kapali') return '';
    return `<tr><td><b>${esc(f.n)}</b><div class="mut" style="font-size:12px">${esc(f.d)}</div></td><td class="pl-c">${t === 'uye' ? '✓' : '—'}</td><td class="pl-c pl-v">✓</td></tr>`;
  };
  return `<div class="grid g2 pl-top">
    <div class="card pl-status ${vip ? 'is-vip' : ''}">
      <div class="pl-crown">${ICON.vip}</div>
      ${isAdmin() ? `<h3>Süperadmin</h3><p class="mut">Tüm özellikler sana her zaman açık.</p>`
      : vip ? `<h3>VIP üyesin</h3><p class="mut">${u >= VIP_FOREVER - 1 ? 'Süresiz VIP' : `<b>${fmtDay(u)}</b> tarihine kadar · ${daysLeft(u)} gün kaldı`}</p>`
      : `<h3>Ücretsiz üyesin</h3><p class="mut">${PLAN.d.on ? 'VIP ile sesli ekip odası, canlı fiyatlar ve ilanlar açılır.' : 'Şu an tüm özellikler herkese açık.'}</p>`}
      ${!isAdmin() && teamShareVip() && !vip ? `<div class="callout y" style="margin-top:10px;padding:8px 12px">Ekip liderin VIP: sesli oda sana da açık.</div>` : ''}
    </div>
    <div class="card pl-buy">
      <h3 style="margin:0 0 6px">VIP üyelik</h3>
      ${planPriceBox()}
      ${PLAN.d.note ? `<p class="mut" style="text-align:center;margin:8px 0 0">${esc(PLAN.d.note)}</p>` : ''}
      <div class="pl-cta">${isAdmin() ? '' : req && !vip ? `<span class="badge y">İsteğin alındı · ${fmtAgo(req)}</span>` : `<button class="btn pri" data-act="pl-want">${ICON.vip} ${vip ? 'Süremi uzatmak istiyorum' : 'VIP olmak istiyorum'}</button>`}</div>
      ${PLAN.d.teamVip ? `<div class="hint" style="text-align:center;margin-top:10px">Ekip VIP'i: ekip lideri VIP ise ekipteki herkes sesli odayı kullanır. Bir kişi öder, tüm ekip konuşur.</div>` : ''}
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-h"><h3>Üye ve VIP karşılaştırma</h3></div>
    <div class="tbl-wrap"><table class="pl-cmp no-card"><thead><tr><th>Özellik</th><th class="pl-c">Üye<br><span class="mut">ücretsiz</span></th><th class="pl-c pl-v">VIP<br><span class="mut">${esc(String(PLAN.d.price || 125))} TL/ay</span></th></tr></thead>
    <tbody>${perks.map(row).join('')}</tbody></table></div>
    <div class="hint" style="margin-top:10px">Canlı GB fiyatları, pazar ve site ilanları üçüncü taraf sitelerden alınır; doğruluğu ve sürekliliği garanti edilmez. Kaynak site kapanırsa bu veriler gelmeyebilir; VIP ücreti bu verilerin garantisi değildir.</div>
  </div>`;
}

/* ---------- süperadmin paneli ---------- */
function planAdminCard() {
  const P = PLAN.d, A = ACC.admin;
  const users = [...(A.users || [])].filter(u => u.code !== 'admin');
  const reqs = users.filter(u => u.vipReq && !(+(u.vipUntil || 0) > Date.now() && +(u.vipUntil || 0) > u.vipReq)).sort((a, b) => b.vipReq - a.vipReq);
  const vips = users.filter(u => +(u.vipUntil || 0) > Date.now()).sort((a, b) => a.vipUntil - b.vipUntil);
  const others = users.filter(u => !vips.includes(u) && !reqs.includes(u)).sort((a, b) => (b.seen || b.at || 0) - (a.seen || a.at || 0));
  const seg = (k, v, opts) => `<div class="seg pl-seg">${opts.map(([o, t]) => `<button class="${v === o ? 'on' : ''}" data-act="pl-set" data-k="${k}" data-v="${o}">${t}</button>`).join('')}</div>`;
  const uRow = u => {
    const until = +(u.vipUntil || 0), on = until > Date.now();
    return `<div class="user-row">
      ${u.photo ? `<img class="u-ph" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : '<span class="u-ph"></span>'}
      <div class="u-tx"><b>${esc(u.name || u.email)} ${on ? `<span class="badge y">VIP · ${until >= VIP_FOREVER - 1 ? 'süresiz' : daysLeft(until) + ' gün'}</span>` : ''} ${u.vipReq && !on ? '<span class="badge r">VIP istiyor</span>' : ''}</b>
        <span>${esc(u.email || '')}${on && until < VIP_FOREVER - 1 ? ' · bitiş ' + fmtDay(until) : ''}${u.vipReq ? ' · istek ' + fmtAgo(u.vipReq) : ''}</span></div>
      <button class="btn sm" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="7">+7 gün</button>
      <button class="btn sm pri" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="30">+30 gün</button>
      <button class="btn sm" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="365">+1 yıl</button>
      ${on || u.vipReq ? `<button class="btn sm ghost danger" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="0">${on ? 'VIP kaldır' : 'İsteği sil'}</button>` : ''}
    </div>`;
  };
  const q = (ui.plq || '').trim().toLocaleLowerCase('tr');
  const shown = q ? others.filter(u => `${u.name} ${u.email}`.toLocaleLowerCase('tr').includes(q)) : others.slice(0, 12);
  return `<div class="card pl-admin">
    <div class="card-h"><div><h3>Üyelik yönetimi <span class="badge y">süperadmin</span></h3><div class="sub">Hangi özelliğin ücretsiz, hangisinin VIP olacağını sen seçersin. Değişiklik anında herkese uygulanır (uygulama, sunucu ve Firebase kuralları).</div></div></div>
    ${PLAN.err === 'rules' ? `<div class="callout r" style="margin-bottom:12px">Yeni Firebase kuralları yayınlanmamış: ayarlar kaydedilemez. Güncelleme notundaki kuralları Firebase'e yapıştır.</div>` : ''}
    <div class="pl-rows">
      <div class="pl-row"><div><b>VIP sistemi</b><span class="mut">Kapalıyken her şey bugünkü gibi herkese açık (ekip kurmak yalnızca sende).</span></div>${seg('on', P.on ? '1' : '0', [['0', 'Kapalı'], ['1', 'Açık']])}</div>
      <div class="pl-row"><div><b>Kayıt</b><span class="mut">Açık: Google ile giren herkes ücretsiz üye olur. Onaylı: sen onaylarsın. Davet: yalnızca davet kodu.</span></div>${seg('signup', P.signup, [['acik', 'Açık'], ['onay', 'Onaylı'], ['davet', 'Davet']])}</div>
      <div class="pl-row"><div><b>Ekip VIP'i</b><span class="mut">Lider VIP ise ekipteki herkes sesli odayı kullanır.</span></div>${seg('teamVip', P.teamVip ? '1' : '0', [['0', 'Kapalı'], ['1', 'Açık']])}</div>
      <div class="pl-row"><div><b>Aylık fiyat</b><span class="mut">Tanıtım sayfasında ve uygulamada görünür.</span></div><span class="pl-pr"><input class="inp" id="plPrice" inputmode="numeric" value="${esc(String(P.price || 125))}" style="width:90px"> TL <button class="btn sm" data-act="pl-price">Kaydet</button></span></div>
      <div class="pl-row"><div><b>VIP notu</b><span class="mut">VIP sayfasında fiyatın altında görünür (ör. "İlk ay %50 indirim").</span></div><span class="pl-pr"><input class="inp" id="plNote" maxlength="140" value="${esc(P.note || '')}" placeholder="isteğe bağlı" style="width:220px"> <button class="btn sm" data-act="pl-note">Kaydet</button></span></div>
    </div>
    <h4 class="users-h">Özellikler ${P.on ? '' : '<span class="badge">VIP sistemi kapalı: seçimler açınca uygulanır</span>'}</h4>
    <div class="pl-feats">${FEATS.map(f => f.g ? `<div class="pl-g">${esc(f.g)}</div>` : `<div class="pl-f">
      <div><b>${esc(f.n)}</b><span class="mut">${esc(f.d)}</span></div>
      ${seg('f:' + f.id, P.features[f.id] || f.def, [['uye', 'Üye'], ['vip', 'VIP'], ['kapali', 'Kapalı']])}
    </div>`).join('')}</div>
    <h4 class="users-h">VIP istekleri <span class="badge ${reqs.length ? 'r' : ''}">${reqs.length}</span></h4>
    <div class="users-list">${reqs.map(uRow).join('') || '<div class="mut" style="padding:8px 2px">Bekleyen istek yok.</div>'}</div>
    <h4 class="users-h">VIP üyeler <span class="badge y">${vips.length}</span></h4>
    <div class="users-list">${vips.map(uRow).join('') || '<div class="mut" style="padding:8px 2px">Henüz VIP üye yok.</div>'}</div>
    <h4 class="users-h">Üyeye VIP ver <span class="badge">${others.length}</span></h4>
    <input class="inp" id="plSearch" data-fk="plSearch" placeholder="Ad ya da e-posta ara" value="${esc(ui.plq || '')}" style="max-width:320px;margin-bottom:8px">
    <div class="users-list">${shown.map(uRow).join('') || '<div class="mut" style="padding:8px 2px">Üye bulunamadı.</div>'}</div>
    <div class="hint" style="margin-top:12px">Ödeme sistemi bağlanana kadar VIP'i buradan elle verirsin; ödeme gelince bu işlem kendiliğinden yapılacak.</div>
  </div>`;
}
const _repaintUsersP = repaintUsers;
repaintUsers = function () { _repaintUsersP(); if (ui.page === 'vip' && isAdmin() && !document.activeElement?.matches?.('#plPrice,#plNote')) render(); };

const planSave = (patch, msg) => FB.setDoc(planRef(), { ...patch, at: Date.now(), by: CLOUD.user.email }, { merge: true })
  .then(() => toast(msg || 'Kaydedildi', 'ok'))
  .catch(e => toast(accPerm(e) ? 'Kaydedilemedi: yeni Firebase kuralları yayınlanmamış' : e.message, 'err'));
Object.assign(ACTIONS, {
  'pl-set': el => {
    const k = el.dataset.k, v = el.dataset.v;
    if (k.startsWith('f:')) {
      const id = k.slice(2);
      PLAN.d.features[id] = v; render();
      return planSave({ features: { [id]: v } }, `${FEAT[id].n}: ${TIER_TR[v]}`);
    }
    if (k === 'on' || k === 'teamVip') {
      const go = () => { PLAN.d[k] = v === '1'; render(); planSave({ [k]: v === '1' }, k === 'on' ? (v === '1' ? 'VIP sistemi açıldı' : 'VIP sistemi kapatıldı') : 'Kaydedildi'); };
      if (k === 'on' && v === '1') {
        const list = vipPerks().map(f => f.n).join(', ') || 'hiçbiri';
        return confirmBox('VIP sistemini aç', `VIP olarak işaretli özellikler (<b>${esc(list)}</b>) VIP olmayan üyelere kapanacak. Mevcut ekip arkadaşlarına önce VIP vermek ister misin? (Ekip VIP'i açıksa senin kurduğun ekipler zaten VIP sayılır.)`, 'Aç', go);
      }
      return go();
    }
    if (k === 'signup') { PLAN.d.signup = v; render(); return planSave({ signup: v }, { acik: 'Kayıt açık: Google ile giren herkes üye olur', onay: 'Kayıt onaylı', davet: 'Kayıt yalnızca davetle' }[v]); }
  },
  'pl-price': () => {
    const n = Math.round(parseNum(($('#plPrice') || {}).value));
    if (!(n > 0 && n < 100000)) return toast('Geçerli bir fiyat girin', 'err');
    PLAN.d.price = n; planSave({ price: n }, `Fiyat: ${n} TL / ay`);
  },
  'pl-note': () => { const t = String(($('#plNote') || {}).value || '').trim().slice(0, 140); PLAN.d.note = t; planSave({ note: t }); },
  'pl-vip': el => {
    const u = (ACC.admin.users || []).find(x => x.uid === el.dataset.uid); if (!u) return;
    const d = +el.dataset.d, cur = +(u.vipUntil || 0);
    const patch = d ? { vipUntil: Math.max(Date.now(), cur) + d * 864e5, vipBy: CLOUD.user.email, vipAt: Date.now(), vipReq: 0 } : { vipUntil: 0, vipReq: 0, vipBy: CLOUD.user.email, vipAt: Date.now() };
    FB.setDoc(accRef(u.uid), patch, { merge: true })
      .then(() => toast(d ? `${u.name || u.email}: VIP +${d} gün` : 'VIP kaldırıldı', 'ok'))
      .catch(e => toast(accPerm(e) ? 'Kaydedilemedi: Firebase kuralları' : e.message, 'err'));
  },
  'pl-want': () => {
    if (!CLOUD.user) return;
    FB.setDoc(accRef(CLOUD.user.uid), { vipReq: Date.now() }, { merge: true })
      .then(() => { if (ACC.data) ACC.data.vipReq = Date.now(); render(); toast('İsteğin yöneticiye iletildi. Ödeme sistemi açılana kadar seninle iletişime geçecek.', 'ok'); })
      .catch(e => toast(accPerm(e) ? 'İstek gönderilemedi: sistem güncelleniyor, biraz sonra tekrar dene' : e.message, 'err'));
  },
});
document.addEventListener('input', e => { if (e.target.id === 'plSearch') { ui.plq = e.target.value; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'plPrice') ACTIONS['pl-price'](); });
