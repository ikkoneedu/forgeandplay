'use strict';
/* ==========================================================================
   EKİP PLANI (etkinlik + katılım)
   Lider ya da bir üye "Cumartesi 20:30 CSW" gibi bir plan açar; herkes
   Geliyorum / Belki / Gelmiyorum der ve hangi karakteriyle geleceğini seçer.
   Plan açılınca ekibe bildirim + sohbete bot mesajı gider; katılanlara sunucu
   zamanlayıcısı başlangıçtan önce hatırlatır.
     kohesapTeams/{kod}/plans/{id} → { t, ev, at, note, by, bn, rsvp: { uid: { s, c, cn, cls, lv, at } }, cAt, att?, loot? }
   Yoklama (att) ve drop dağıtımı (loot) eloot.js'te.
   ========================================================================== */
const EP = { unsub: null, code: '', list: [], loaded: false, err: '', showPast: false };
const EP_RSVP = { y: { t: 'Geliyorum', s: 'Geliyor', cls: 'g' }, m: { t: 'Belki', s: 'Belki', cls: 'y' }, n: { t: 'Gelmiyorum', s: 'Gelmiyor', cls: 'r' } };
const epCol = code => FB.collection(CLOUD.db, 'kohesapTeams', code, 'plans');
const epRef = (code, id) => FB.doc(CLOUD.db, 'kohesapTeams', code, 'plans', id);
const EP_DAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
/** "Bugün 21:00" · "Yarın 20:30" · "Cumartesi 25 Ekim 20:30" */
function epDayTime(ms) {
  const d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  const day = diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : diff === -1 ? 'Dün' : DAYS[d.getDay()] + ' ' + d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return day + ' ' + clock(ms);
}

function epWatch() {
  const code = TEAM.doc && CLOUD.db ? TEAM.code : '';
  if (code === EP.code) return;
  if (EP.unsub) { try { EP.unsub(); } catch { } EP.unsub = null; }
  EP.code = code; EP.list = []; EP.loaded = false; EP.err = '';
  if (!code) return;
  EP.unsub = FB.onSnapshot(FB.query(epCol(code), FB.orderBy('at'), FB.limitToLast(40)), snap => {
    EP.loaded = true; EP.err = '';
    EP.list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (ui.page === 'planla' || ui.page === 'panel') epPaint();
  }, e => {
    EP.loaded = true;
    EP.err = isPermErr(e) ? 'Ekip planı için Firebase kurallarının güncel hali yayınlanmalı.' : e.message;
    if (isPermErr(e)) TEAM.rulesMissing = true;
    if (ui.page === 'planla') epPaint();
  });
}
function epPaint() { if (!$('#modalBack').hidden) return; render(); }

/* ---------- katılım özeti ---------- */
function epMyChar(id) {
  const chars = (CUR.acc && CUR.acc.chars) || [];
  return chars.find(c => c.id === id) || CUR.ch || chars[0] || null;
}
function epRsvpEntry(s, charId) {
  const c = s === 'n' ? null : epMyChar(charId);
  const e = { s, at: Date.now() };
  if (c) Object.assign(e, { c: c.id, cn: String(c.name || '').slice(0, 30), cls: c.cls || '', lv: +c.level || 0 });
  return e;
}
/** ekip üyeleri + cevapları (cevapsızlar dahil) */
function epRows(p) {
  const rs = p.rsvp || {};
  return teamMembers().map(m => ({ m, r: rs[m.uid] || null }));
}
function epTips(rows) {
  const going = rows.filter(x => x.r && x.r.s === 'y' && x.r.cls);
  const tips = [];
  if (going.length >= 3 && !going.some(x => x.r.cls === 'priest')) tips.push('Gelenler arasında Priest yok.');
  if (going.length >= 4 && !going.some(x => x.r.cls === 'warrior' || x.r.cls === 'kurian')) tips.push('Ön safta Warrior veya Kurian/Portu yok.');
  return tips;
}

/* ---------- yazma ---------- */
async function epCreate(v) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const me = myUid();
  const doc = { t: v.t.slice(0, 60), ev: (v.ev || '').slice(0, 24), at: v.at, note: (v.note || '').slice(0, 200), by: me, bn: whoShort().slice(0, 40), rsvp: { [me]: epRsvpEntry('y') }, cAt: Date.now() };
  await FB.setDoc(epRef(TEAM.code, id), doc);
  const when = epDayTime(v.at);
  if (typeof botSay === 'function') botSay(`📅 **${doc.t}** planlandı · ${when} — ${doc.bn}${doc.note ? '\n' + doc.note : ''}\nKatılım: Ekip Planı sayfası`, 'plan').catch(() => { });
  if (typeof notifyTeam === 'function') notifyTeam('plan', { title: doc.t, at: v.at, when });
}
async function epAnswer(p, s, charId) {
  const me = myUid();
  const cur = (p.rsvp || {})[me];
  const val = cur && cur.s === s && (s === 'n' || !charId || cur.c === charId) ? FB.deleteField() : epRsvpEntry(s, charId || (cur && cur.c));
  try { await FB.setDoc(epRef(TEAM.code, p.id), { rsvp: { [me]: val } }, { merge: true }); }
  catch (e) { toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'); }
}
const epCanEdit = p => p.by === myUid() || (TEAM.doc && TEAM.doc.owner === myUid());

/* ---------- form ---------- */
/** önümüzdeki 7 günün eventleri: "Paz 20:30 · Castle Siege War (CSW)" */
function epEventOptions() {
  const now = new Date();
  return occurrences(now, now.getTime() + 7 * 864e5).filter(o => o.st > now && !/bakım/i.test(o.e.name)).slice(0, 60)
    .map(o => [String(o.st.getTime()) + '|' + (o.e.pid || o.e.id), `${EP_DAY[o.st.getDay()]} ${o.t} · ${o.e.name}`, o]);
}
/** pid verilirse o eventin en yakın seansı seçili gelir (Event Rehberi → "Ekiple planla") */
function epForm(p, pid) {
  const isNew = !p;
  const evOpts = isNew ? epEventOptions() : [];
  const pre = pid && evOpts.find(x => x[2].e.pid === pid);
  if (pid && !pre) toast('Bu event önümüzdeki 7 günde takvimde yok; özel saat seç', 'err');
  const d = p ? new Date(p.at) : new Date(Date.now() + 3600e3);
  openForm({
    title: isNew ? 'Yeni plan' : 'Planı düzenle',
    data: { occ: pre ? pre[0] : evOpts.length && !pid ? evOpts[0][0] : 'ozel', t: p ? p.t : pid && !pre && typeof guideByPid === 'function' && guideByPid(pid) ? guideByPid(pid).n : '', date: localDate(d), time: pad(d.getHours()) + ':' + pad(isNew ? 0 : d.getMinutes()), note: p ? p.note || '' : '' },
    fields: [
      ...(isNew ? [{ k: 'occ', label: 'Ne zaman?', type: 'select', full: true, options: [...evOpts.map(([k, l]) => [k, l]), ['ozel', 'Özel plan (aşağıdaki gün ve saat)']] }] : []),
      { k: 't', label: 'Başlık', type: 'text', full: true, placeholder: isNew ? 'Event seçtiysen boş bırakabilirsin · örn. Ardream farmı' : '' },
      { k: 'date', label: 'Gün', type: 'date', hint: isNew ? 'Yalnızca özel planda' : '' },
      { k: 'time', label: 'Saat', type: 'text', placeholder: 'örn. 21:00' },
      { k: 'note', label: 'Not', type: 'text', full: true, placeholder: 'örn. Moradon\'da toplanıyoruz · 83+ gelsin' },
    ],
    onSave: v => {
      let at = 0, ev = p ? p.ev || '' : '', t = v.t.trim();
      if (isNew && v.occ !== 'ozel') {
        const o = evOpts.find(x => x[0] === v.occ);
        if (!o) { toast('Event seçilemedi', 'err'); return false; }
        at = o[2].st.getTime(); ev = String(o[2].e.pid || '').slice(0, 24); t = t || o[2].e.name;
      } else {
        const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v.time || '').trim());
        if (!m || !v.date || +m[1] > 23) { toast('Gün ve saati gir (SS:DD)', 'err'); return false; }
        const dt = new Date(v.date + 'T00:00'); dt.setHours(+m[1], +m[2], 0, 0); at = dt.getTime();
      }
      if (!t) { toast('Başlık gir', 'err'); return false; }
      if (at < Date.now() - 3600e3) { toast('Geçmiş bir saate plan açılamaz', 'err'); return false; }
      const job = isNew ? epCreate({ t, ev, at, note: v.note.trim() })
        : FB.setDoc(epRef(TEAM.code, p.id), { t: t.slice(0, 60), at, note: v.note.trim().slice(0, 200) }, { merge: true });
      job.then(() => toast(isNew ? 'Plan açıldı, ekibe haber verildi' : 'Plan güncellendi', 'ok'))
        .catch(e => toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'));
    },
  });
}

/* ---------- görünüm ---------- */
ICON.planla = I('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'event') + 1, 0, { id: 'planla', t: 'Ekip Planı', d: 'Etkinlik planla · kim geliyor, hangi karakterle · başlamadan hatırlatma' });

function epCard(p, now) {
  const rows = epRows(p), me = myUid(), mine = (p.rsvp || {})[me];
  const cnt = s => rows.filter(x => x.r && x.r.s === s).length;
  const none = rows.filter(x => !x.r).length;
  const past = p.at < now - 3600e3, live = p.at <= now && !past;
  const chars = (CUR.acc && CUR.acc.chars) || [];
  const tips = past ? [] : epTips(rows);
  const order = { y: 0, m: 1, n: 2 };
  const sorted = rows.slice().sort((a, b) => (a.r ? order[a.r.s] : 3) - (b.r ? order[b.r.s] : 3));
  const who = x => {
    const r = x.r, c = r && r.cn ? { name: r.cn, cls: r.cls, level: r.lv } : x.m.mainChar;
    const st = r ? EP_RSVP[r.s] : null;
    return `<div class="ep-who ${r ? 'is-' + r.s : 'is-none'}">
      ${c && c.cls ? charAvatar(Object.assign({ nation: (x.m.mainChar || {}).nation }, c), 24) : ''}
      <span class="ep-wn"><b>${esc(c ? c.name : x.m.name)}</b>${c && c.level ? `<small>Lv ${c.level}${c.cls && CLASSES[c.cls] ? ' · ' + esc(c.cls === 'kurian' ? 'Kurian/Portu' : CLASSES[c.cls].label) : ''}</small>` : ''}</span>
      <span class="badge ${st ? st.cls : ''}">${st ? st.s : 'Cevap yok'}</span>
    </div>`;
  };
  return `<article class="card ep-card ${past ? 'past' : ''} ${live ? 'live' : ''}">
    <div class="ep-top">
      <div class="ep-when"><b>${EP_DAY[new Date(p.at).getDay()]}</b><span>${clock(p.at)}</span></div>
      <div class="ep-title">
        <h3>${esc(p.t)}</h3>
        <div class="mut">${esc(epDayTime(p.at))}${p.bn ? ' · açan ' + esc(p.bn) : ''}</div>
        ${p.note ? `<div class="ep-note">${esc(p.note)}</div>` : ''}
      </div>
      <div class="ep-cd">${past ? '<span class="mut">bitti</span>' : live ? '<span class="badge g">başladı</span>' : `<span class="mono" data-cd="${p.at}">${fmtCD(p.at - now)}</span>`}</div>
    </div>
    <div class="ep-sum"><span class="badge g">${cnt('y')} geliyor</span><span class="badge y">${cnt('m')} belki</span><span class="badge r">${cnt('n')} gelmiyor</span>${none ? `<span class="badge">${none} cevap yok</span>` : ''}</div>
    ${tips.length ? `<div class="callout y ep-tip">${tips.map(esc).join(' ')}</div>` : ''}
    <div class="ep-list">${sorted.map(who).join('')}</div>
    ${(past || live) && typeof epAfter === 'function' ? epAfter(p, rows) : ''}
    ${past ? '' : `<div class="ep-acts">
      ${['y', 'm', 'n'].map(s => `<button class="btn sm ${mine && mine.s === s ? 'pri' : ''}" data-act="ep-rsvp" data-id="${esc(p.id)}" data-s="${s}">${EP_RSVP[s].t}</button>`).join('')}
      ${mine && mine.s !== 'n' && chars.length > 1 ? `<select class="inp ep-char" data-ep-char="${esc(p.id)}" aria-label="Hangi karakterle">${chars.map(c => `<option value="${esc(c.id)}" ${mine.c === c.id ? 'selected' : ''}>${esc(c.name)} · Lv ${c.level}</option>`).join('')}</select>` : ''}
      <span class="spacer"></span>
      ${p.ev && typeof guideByPid === 'function' && guideByPid(p.ev) ? `<button class="btn sm ghost" data-act="gd-open" data-id="${esc(p.ev)}">Rehber</button>` : ''}
      ${typeof sharePlan === 'function' ? `<button class="icon-btn" data-act="sh-plan" data-id="${esc(p.id)}" title="Davet kartı paylaş" aria-label="Paylaş">${ICON.share}</button>` : ''}
      ${epCanEdit(p) ? `<button class="btn sm ghost" data-act="ep-edit" data-id="${esc(p.id)}">Düzenle</button><button class="icon-btn danger" data-act="ep-del" data-id="${esc(p.id)}" title="Planı sil" aria-label="Planı sil">${ICON.del}</button>` : ''}
    </div>`}
  </article>`;
}
VIEWS.planla = () => {
  if (!TEAM.doc) return `<div class="card">${empty('Ekip planı ekip içinde çalışır', 'Plan açarsın, ekipteki herkes geliyor / belki / gelmiyor der; başlamadan önce katılanlara hatırlatma gider.')}<div style="text-align:center;margin-top:12px"><button class="btn pri" data-act="go" data-id="ekip">Ekip sayfasına git</button></div></div>`;
  epWatch();
  const now = Date.now();
  const upcoming = EP.list.filter(p => p.at >= now - 3600e3).sort((a, b) => a.at - b.at);
  const past = EP.list.filter(p => p.at < now - 3600e3).sort((a, b) => b.at - a.at).slice(0, 10);
  const head = (TEAM.rulesMissing && typeof rulesBox === 'function' ? rulesBox() : '') + `
  <section class="card ep-hero">
    <div><h3>${esc(TEAM.doc.name || 'Ekip')} · plan</h3>
      <span class="mut">Bir etkinlik ya da farm saati seç; ekip <b>Geliyorum / Belki / Gelmiyorum</b> der, hangi karakterle geleceğini seçer. Plan açılınca ekibe bildirim gider, katılanlara başlamadan önce hatırlatılır.</span></div>
    <button class="btn pri" data-act="ep-new">${ICON.plus} Yeni plan</button>
  </section>
  ${EP.err ? `<div class="callout r" style="margin:12px 0">${esc(EP.err)}</div>` : ''}`;
  if (!EP.loaded) return head + `<div class="card">${empty('Yükleniyor…', '')}</div>`;
  const body = upcoming.length ? `<div class="ep-grid">${upcoming.map(p => epCard(p, now)).join('')}</div>`
    : `<div class="card">${empty('Açık plan yok', 'İlk planı aç: örneğin bu haftaki Castle Siege War ya da akşam farmı.')}</div>`;
  const pastHtml = past.length ? `<section class="ep-past">
    <button class="btn ghost sm" data-act="ep-past">${EP.showPast ? 'Geçmişi gizle' : `Geçmiş planlar (${past.length})`}</button>
    ${EP.showPast ? `<div class="ep-grid">${past.map(p => epCard(p, now)).join('')}</div>` : ''}
  </section>` : '';
  return head + body + (typeof epStatsCard === 'function' ? epStatsCard(now) : '') + pastHtml + `<p class="hint" style="margin-top:14px">Hatırlatma, Bildirimler sayfasındaki "event öncesi" ayarına ve boss sayfasındaki önceden haber süresine göre gider. Yalnızca "Geliyorum" ya da "Belki" diyenlere gönderilir.</p>`;
};

Object.assign(ACTIONS, {
  'ep-new': () => epForm(),
  'ep-edit': el => { const p = EP.list.find(x => x.id === el.dataset.id); if (p) epForm(p); },
  'ep-rsvp': el => { const p = EP.list.find(x => x.id === el.dataset.id); if (p) epAnswer(p, el.dataset.s); },
  'ep-del': el => {
    const p = EP.list.find(x => x.id === el.dataset.id); if (!p) return;
    confirmBox('Planı sil', `<b>${esc(p.t)}</b> (${esc(epDayTime(p.at))}) silinsin mi? Katılım cevapları da silinir.`, 'Sil', () =>
      FB.deleteDoc(epRef(TEAM.code, p.id)).then(() => toast('Plan silindi', 'ok')).catch(e => toast(e.message, 'err')));
  },
  'ep-past': () => { EP.showPast = !EP.showPast; render(); },
});
document.addEventListener('change', e => {
  const id = e.target.dataset && e.target.dataset.epChar; if (id == null) return;
  const p = EP.list.find(x => x.id === id); const mine = p && (p.rsvp || {})[myUid()];
  if (p && mine) epAnswer(p, mine.s, e.target.value);
});

const _logoutE = logout;
logout = async function () { if (EP.unsub) { EP.unsub(); EP.unsub = null; } EP.code = ''; EP.list = []; return _logoutE(); };
