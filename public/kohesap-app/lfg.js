'use strict';
/* ==========================================================================
   EKİP BUL (ilan panosu)
   İki tür ilan: "Ekip arıyorum" (oyuncu) ve "Üye arıyorum" (ekip). Her kullanıcının
   tek ilanı vardır, 7 gün sonra düşer ("Yenile" ile uzar). Lider isterse ekip kodunu
   ilana koyar; ilanı gören tek dokunuşla katılır (kurallar kodun gerçekten liderin
   ekibine ait olduğunu denetler).
     kohesapLfg/{uid} → { k: 'ekip'|'uye', srv, nat, cls: [..], lv, ws, note, contact,
                          n, cn, tn, code, cnt, at, exp }
   ========================================================================== */
const LF = { unsub: null, list: [], loaded: false, err: '', f: { k: 'all', srv: '', nat: '', cls: '', mine: false } };
const LF_DAYS = 7;
const lfRef = u => FB.doc(CLOUD.db, 'kohesapLfg', u);
const LF_WS = ['Sabah', 'Öğlen', 'Akşam', 'Gece', 'Hafta sonu', 'Her zaman'];
function lfWatch() {
  if (LF.unsub || !CLOUD.db || !myUid()) return;
  LF.unsub = FB.onSnapshot(FB.query(FB.collection(CLOUD.db, 'kohesapLfg'), FB.orderBy('at'), FB.limitToLast(150)), s => {
    LF.loaded = true; LF.err = '';
    LF.list = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (ui.page === 'lfg' && $('#modalBack').hidden) render();
  }, e => {
    LF.loaded = true; LF.err = isPermErr(e) ? 'İlan panosu için Firebase kurallarının güncel hali yayınlanmalı.' : e.message;
    if (isPermErr(e)) TEAM.rulesMissing = true;
    if (ui.page === 'lfg') render();
  });
}
const lfMine = () => LF.list.find(x => x.id === myUid()) || null;
const lfLive = (x, now = Date.now()) => +x.exp > now;
const lfIsOwner = () => !!(TEAM.doc && TEAM.doc.owner === myUid());
const clsName = k => k === 'kurian' ? 'Kurian/Portu' : (CLASSES[k] || {}).label || k;

/* ---------- form ---------- */
function lfForm(kind) {
  const old = lfMine(), ch = CUR.ch || {};
  kind = kind || (old && old.k) || 'ekip';
  if (kind === 'uye' && !TEAM.doc) return toast('Üye aramak için önce bir ekip kur ya da ekibe katıl', 'err');
  const d = old && old.k === kind ? old : null;
  const clsOpts = Object.keys(CLASSES).map(k => [k, clsName(k)]);
  openForm({
    title: kind === 'ekip' ? 'Ekip arıyorum ilanı' : 'Üye arıyorum ilanı',
    data: {
      srv: (d && d.srv) || ch.server || S.settings.server || DEFAULT_SERVERS[0],
      nat: (d && d.nat) || ch.nation || 'karus',
      cls: (d && d.cls && d.cls[0]) || (kind === 'ekip' ? ch.cls || 'warrior' : ''),
      cls2: (d && d.cls && d.cls[1]) || '',
      lv: String((d && d.lv) || (kind === 'ekip' ? ch.level || '' : 80)),
      ws: (d && d.ws) || 'Akşam', note: (d && d.note) || '', contact: (d && d.contact) || '',
      code: d ? (d.code ? '1' : '') : (kind === 'uye' && lfIsOwner() ? '1' : ''),
    },
    fields: [
      { k: 'srv', label: 'Sunucu', type: 'select', options: [...new Set([...DEFAULT_SERVERS, (d && d.srv) || ch.server || ''].filter(Boolean))].map(s => [s, s]) },
      { k: 'nat', label: 'Irk', type: 'select', options: [['karus', 'Karus'], ['human', 'El Morad']] },
      { k: 'cls', label: kind === 'ekip' ? 'Sınıfın' : 'Aranan sınıf', type: 'select', options: kind === 'ekip' ? clsOpts : [['', 'Fark etmez'], ...clsOpts] },
      ...(kind === 'uye' ? [{ k: 'cls2', label: 'İkinci aranan sınıf', type: 'select', options: [['', '—'], ...clsOpts] }] : []),
      { k: 'lv', label: kind === 'ekip' ? 'Seviyen' : 'En az seviye', type: 'number' },
      { k: 'ws', label: 'Oynama saati', type: 'select', options: LF_WS.map(x => [x, x]) },
      { k: 'contact', label: 'İletişim (oyun içi nick / Discord)', type: 'text', full: true, placeholder: 'örn. KaraKurt (oyun içi) · discord: karakurt' },
      { k: 'note', label: 'Not', type: 'text', full: true, placeholder: kind === 'ekip' ? 'örn. Her akşam CSW ve BDW, sesli oda tamam' : 'örn. CSW için düzenli priest arıyoruz' },
      ...(kind === 'uye' && lfIsOwner() ? [{ k: 'code', label: 'Ekip kodu ilanda görünsün mü?', type: 'select', full: true, options: [['1', 'Evet, isteyen doğrudan katılsın'], ['', 'Hayır, önce benimle iletişime geçsinler']] }] : []),
    ],
    onSave: v => {
      const lv = Math.round(parseNum(v.lv));
      if (!(lv >= 1 && lv <= 83)) { toast('Seviye 1–83 arası olmalı', 'err'); return false; }
      if (!v.contact.trim() && !(kind === 'uye' && v.code)) { toast('İletişim bilgisi gir (oyun içi nick ya da Discord)', 'err'); return false; }
      const now = Date.now();
      const doc = {
        k: kind, srv: v.srv.slice(0, 24), nat: v.nat === 'human' ? 'human' : 'karus',
        cls: [v.cls, v.cls2].filter(Boolean).slice(0, 2), lv, ws: v.ws.slice(0, 20),
        note: v.note.trim().slice(0, 200), contact: v.contact.trim().slice(0, 60),
        n: String((CLOUD.user && CLOUD.user.displayName) || '').slice(0, 40), cn: String(ch.name || '').slice(0, 30),
        tn: kind === 'uye' ? String(TEAM.doc.name || '').slice(0, 40) : '',
        code: kind === 'uye' && v.code && lfIsOwner() ? TEAM.code : '',
        cnt: kind === 'uye' ? (TEAM.doc.memberUids || []).length : 0,
        at: now, exp: now + LF_DAYS * 864e5,
      };
      FB.setDoc(lfRef(myUid()), doc).then(() => toast('İlan yayında · ' + LF_DAYS + ' gün görünür', 'ok'))
        .catch(e => toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'));
    },
  });
}

/* ---------- görünüm ---------- */
ICON.lfg = I('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/><path d="M10.5 8v5M8 10.5h5"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'ekip') + 1, 0, { id: 'lfg', t: 'Ekip Bul', d: 'Ekip arayan oyuncular ve üye arayan ekipler · sunucu, ırk, sınıf ve seviyeye göre' });

function lfCard(x, now) {
  const isTeam = x.k === 'uye', me = x.id === myUid(), n = NATIONS[x.nat] || NATIONS.karus;
  const c0 = x.cls && x.cls[0], cc = c0 && CLASSES[c0] ? CLASSES[c0].color : 'var(--tx3)';
  const canJoin = isTeam && x.code && !TEAM.doc && (x.cnt || 0) < TEAM_MAX;
  const ago = Math.max(0, now - (+x.at || now)), agoT = ago < 3600e3 ? Math.max(1, Math.round(ago / 60000)) + ' dk önce' : ago < 864e5 ? Math.round(ago / 3600e3) + ' sa önce' : Math.round(ago / 864e5) + ' gün önce';
  return `<article class="card lf-card ${isTeam ? 'team' : ''} ${me ? 'me' : ''}" style="--cc:${cc};--nc:${n.color}">
    <div class="lf-top">
      <span class="badge ${isTeam ? 'b' : 'g'}">${isTeam ? 'Üye arıyor' : 'Ekip arıyor'}</span>
      <span class="mut lf-ago">${agoT}</span>
    </div>
    <div class="lf-who">
      ${isTeam ? `<span class="lf-ic">${ICON.ekip}</span>` : charAvatar({ cls: c0, nation: x.nat }, 40)}
      <div><b>${esc(isTeam ? x.tn || 'Ekip' : x.cn || x.n || 'Oyuncu')}</b>
        <span class="mut">${isTeam ? `${x.cnt || 0}/${TEAM_MAX} üye · ${esc(x.srv)} · ${esc(n.label)}` : `Lv ${x.lv} ${esc(clsName(c0))} · ${esc(x.srv)} · ${esc(n.label)}`}</span></div>
    </div>
    <div class="lf-tags">
      ${isTeam ? `<span class="badge">Aranan: ${(x.cls || []).length ? x.cls.map(k => esc(clsName(k))).join(', ') : 'her sınıf'}</span><span class="badge">En az Lv ${x.lv}</span>` : ''}
      <span class="badge">${esc(x.ws || '')}</span>
    </div>
    ${x.note ? `<p class="lf-note">${esc(x.note)}</p>` : ''}
    <div class="lf-acts">
      ${x.contact ? `<button class="btn sm" data-act="lf-copy" data-v="${esc(x.contact)}" title="Kopyala">${ICON.copy} ${esc(x.contact)}</button>` : ''}
      ${canJoin ? `<button class="btn sm pri" data-act="lf-join" data-code="${esc(x.code)}">Ekibe katıl</button>` : isTeam && x.code && TEAM.doc && TEAM.code === x.code ? '<span class="badge g">senin ekibin</span>' : ''}
      ${me ? `<span class="spacer"></span><button class="btn sm ghost" data-act="lf-edit">Düzenle</button>` : ''}
    </div>
  </article>`;
}
VIEWS.lfg = () => {
  if (!CLOUD.user) return `<div class="card">${empty('Giriş gerekli', '')}</div>`;
  lfWatch();
  const now = Date.now(), f = LF.f, lv = +(CUR.ch && CUR.ch.level) || 0;
  const mine = lfMine();
  let list = LF.list.filter(x => lfLive(x, now));
  if (f.k !== 'all') list = list.filter(x => x.k === f.k);
  if (f.srv) list = list.filter(x => x.srv === f.srv);
  if (f.nat) list = list.filter(x => x.nat === f.nat);
  if (f.cls) list = list.filter(x => (x.cls || []).includes(f.cls) || (x.k === 'uye' && !(x.cls || []).length));
  if (f.mine && lv) list = list.filter(x => x.k !== 'uye' || lv >= x.lv);
  list.sort((a, b) => (b.id === myUid()) - (a.id === myUid()) || b.at - a.at);
  const servers = [...new Set([...DEFAULT_SERVERS, ...LF.list.map(x => x.srv)])];
  const sel = (key, opts) => `<select class="inp" data-lf="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${f[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return (TEAM.rulesMissing && typeof rulesBox === 'function' ? rulesBox() : '') + `
  <section class="card lf-hero">
    <div><h3>Ekip bul, ekibine üye bul</h3><span class="mut">İlanın ${LF_DAYS} gün görünür. İletişim bilgisini sen yazarsın; uygulama kimsenin hesabını paylaşmaz.</span></div>
    <div class="lf-my">
      ${mine && lfLive(mine, now) ? `<span class="badge g">İlanın yayında · ${Math.max(1, Math.ceil((mine.exp - now) / 864e5))} gün kaldı</span>
        <button class="btn sm" data-act="lf-renew">Yenile</button><button class="btn sm" data-act="lf-edit">Düzenle</button><button class="btn sm ghost danger" data-act="lf-del">Kaldır</button>`
      : `<button class="btn pri" data-act="lf-new" data-k="ekip">${ICON.plus} Ekip arıyorum</button>${TEAM.doc ? `<button class="btn" data-act="lf-new" data-k="uye">${ICON.plus} Üye arıyorum</button>` : ''}`}
    </div>
  </section>
  ${LF.err ? `<div class="callout r" style="margin:12px 0">${esc(LF.err)}</div>` : ''}
  <div class="row lf-filters">
    ${sel('k', [['all', 'Tüm ilanlar'], ['ekip', 'Ekip arayanlar'], ['uye', 'Üye arayan ekipler']])}
    ${sel('srv', [['', 'Tüm sunucular'], ...servers.map(s => [s, s])])}
    ${sel('nat', [['', 'Her ırk'], ['karus', 'Karus'], ['human', 'El Morad']])}
    ${sel('cls', [['', 'Her sınıf'], ...Object.keys(CLASSES).map(k => [k, clsName(k)])])}
    ${lv ? `<label class="check"><input type="checkbox" data-lf-mine ${f.mine ? 'checked' : ''}> Seviyeme uygun ekipler</label>` : ''}
    <span class="spacer"></span><span class="hint">${list.length} ilan</span>
  </div>
  ${!LF.loaded ? `<div class="card">${empty('Yükleniyor…', '')}</div>` : list.length ? `<div class="lf-grid">${list.map(x => lfCard(x, now)).join('')}</div>`
    : `<div class="card">${empty('Bu filtrede ilan yok', 'İlk ilanı sen ver: ekip arıyorsan "Ekip arıyorum", ekibine oyuncu arıyorsan "Üye arıyorum".')}</div>`}`;
};

Object.assign(ACTIONS, {
  'lf-new': el => lfForm(el.dataset.k),
  'lf-edit': () => lfForm(),
  'lf-renew': () => { const m = lfMine(); if (!m) return; const now = Date.now(); const { id: _id, ...rest } = m; FB.setDoc(lfRef(myUid()), { ...rest, at: now, exp: now + LF_DAYS * 864e5, cnt: m.k === 'uye' && TEAM.doc ? (TEAM.doc.memberUids || []).length : m.cnt || 0 }).then(() => toast('İlan yenilendi', 'ok')).catch(e => toast(e.message, 'err')); },
  'lf-del': () => confirmBox('İlanı kaldır', 'İlanın panodan kaldırılsın mı?', 'Kaldır', () => FB.deleteDoc(lfRef(myUid())).then(() => toast('İlan kaldırıldı', 'ok')).catch(e => toast(e.message, 'err'))),
  'lf-copy': el => (navigator.clipboard ? navigator.clipboard.writeText(el.dataset.v) : Promise.reject()).then(() => toast('Kopyalandı: ' + el.dataset.v, 'ok')).catch(() => toast(el.dataset.v)),
  'lf-join': el => confirmBox('Ekibe katıl', 'Bu ekibe katılacaksın; karakter bilgilerin ekip üyelerine görünür.', 'Katıl', () =>
    teamJoin(el.dataset.code).then(() => { toast('Ekibe katıldın', 'ok'); ui.page = 'ekip'; render(); }).catch(e => toast(e.message, 'err'))),
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.lf != null) { LF.f[d.lf] = e.target.value; render(); }
  if (d.lfMine != null) { LF.f.mine = e.target.checked; render(); }
});
const _logoutL = logout;
logout = async function () { if (LF.unsub) { LF.unsub(); LF.unsub = null; } LF.list = []; LF.loaded = false; return _logoutL(); };
