'use strict';
/* ==========================================================================
   GÜNLÜK / HAFTALIK YAPILACAKLAR (karakter başına)
   ch.data.todo = { items: [{ id, t, per: 'g'|'h', pid?, off? }], done: { id: dönemAnahtarı }, hist: { 'YYYY-AA-GG': [yapılan, toplam] } }
   Dönem anahtarı: günlük → sıfırlanma saatine göre gün, haftalık → sıfırlanma gününe göre haftanın ilk günü.
   Sıfırlanma ayarı ortak (DB.shared.todoReset = { h: 0, d: 1 }).
   Veri karakterle birlikte buluta kaydedilir; her cihazda aynıdır.
   ========================================================================== */
const TODO_DEF = [
  { id: 'gq', t: 'Günlük görevler', per: 'g' },
  { id: 'cz', t: 'Chaos Dungeon', per: 'g', pid: 'cz' },
  { id: 'bdw', t: 'Border Defense War', per: 'g', pid: 'bdw' },
  { id: 'jr', t: 'Juraid Mountain', per: 'g', pid: 'jr' },
  { id: 'ft', t: 'Forgotten Temple', per: 'g', pid: 'ft' },
  { id: 'bif', t: 'Bifrost', per: 'g', pid: 'bif' },
  { id: 'boss', t: 'Boss turu (sayaçları güncelle)', per: 'g' },
  { id: 'pazar', t: 'Pazar ve ilanlara bak', per: 'g' },
  { id: 'utc', t: 'Under The Castle', per: 'h', pid: 'utc' },
  { id: 'csw', t: 'Castle Siege War', per: 'h', pid: 'csw' },
  { id: 'lw', t: 'Lunar War', per: 'h', pid: 'lw' },
  { id: 'kasa', t: 'Haftalık gelir–gider özetine bak', per: 'h' },
];
const TD = { edit: false };
const todoReset = () => Object.assign({ h: 0, d: 1 }, (DB && DB.shared && DB.shared.todoReset) || {});
function todoOf(ch) {
  if (!ch || !ch.data) return null;
  const d = ch.data;
  if (!d.todo || !Array.isArray(d.todo.items)) d.todo = { items: TODO_DEF.map(x => ({ ...x })), done: {}, hist: {} };
  d.todo.done = d.todo.done || {}; d.todo.hist = d.todo.hist || {};
  return d.todo;
}
/** sıfırlanma saatine göre "bugün" (sıfırlanmadan önceyse dün sayılır) */
function todoDayKey(ms = Date.now()) {
  const r = todoReset(), d = new Date(ms);
  if (d.getHours() < r.h) d.setDate(d.getDate() - 1);
  return localDate(d);
}
function todoWeekKey(ms = Date.now()) {
  const r = todoReset(), d = new Date(todoDayKey(ms) + 'T00:00');
  d.setDate(d.getDate() - ((d.getDay() - r.d + 7) % 7));
  return 'H' + localDate(d);
}
const todoKey = (per, ms) => per === 'h' ? todoWeekKey(ms) : todoDayKey(ms);
const todoIsDone = (td, it, ms) => td.done[it.id] === todoKey(it.per, ms);
/** sıradaki sıfırlanma (ms) */
function todoNextReset(per) {
  const r = todoReset(), now = new Date(), d = new Date(now); d.setHours(r.h, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  if (per === 'h') while (d.getDay() !== r.d) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function todoStats(td, ms) {
  const act = td.items.filter(x => !x.off && x.per === 'g');
  return { done: act.filter(x => todoIsDone(td, x, ms)).length, total: act.length };
}
/** bugünün günlük özetini geçmişe yaz (son 60 gün) */
function todoRecord(td) {
  const k = todoDayKey(), s = todoStats(td);
  td.hist[k] = [s.done, s.total];
  const keys = Object.keys(td.hist).sort();
  keys.slice(0, Math.max(0, keys.length - 60)).forEach(x => delete td.hist[x]);
}
function todoStreak(td) {
  let n = 0; const d = new Date(todoDayKey() + 'T12:00');
  const today = td.hist[localDate(d)];
  if (!(today && today[1] && today[0] >= today[1])) d.setDate(d.getDate() - 1); // bugün bitmediyse dünden say
  for (let i = 0; i < 400; i++) { const h = td.hist[localDate(d)]; if (!(h && h[1] && h[0] >= h[1])) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- görünüm ---------- */
ICON.gunluk = I('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'panel'), 0, { id: 'gunluk', t: 'Günlük Görevler', d: 'Karakter başına günlük ve haftalık yapılacaklar · sıfırlanma saatinde kendiliğinden temizlenir' });

function todoNextOcc(pid, now) {
  const e = (S.events || []).find(x => !x.off && (x.pid === pid || (typeof guideFor === 'function' && guideFor(x) && guideFor(x).pid === pid)));
  if (!e) return null;
  const o = occurrences(new Date(now), now + 8 * 864e5).find(x => x.e === e && x.en.getTime() > now);
  return o ? o.st.getTime() : null;
}
function todoRow(td, it, now, chId) {
  const on = todoIsDone(td, it, now), nx = it.pid ? todoNextOcc(it.pid, now) : null;
  const live = nx && nx <= now;
  return `<div class="td-row ${on ? 'on' : ''}">
    <label class="td-ck"><input type="checkbox" data-td="${esc(it.id)}" data-td-ch="${esc(chId)}" ${on ? 'checked' : ''}><span>${esc(it.t)}</span></label>
    ${nx ? `<span class="td-nx ${live ? 'live' : ''}">${live ? 'şu an' : `${esc(EP_DAY[new Date(nx).getDay()])} ${clock(nx)}`}</span>` : ''}
    ${it.pid && typeof guideByPid === 'function' && guideByPid(it.pid) ? `<a href="#" class="td-g" data-act="gd-open" data-id="${esc(it.pid)}" title="Rehber">?</a>` : ''}
    ${TD.edit ? `<button class="icon-btn danger td-x" data-act="td-del" data-id="${esc(it.id)}" title="Kaldır" aria-label="Kaldır">${ICON.del}</button>` : ''}
  </div>`;
}
VIEWS.gunluk = () => {
  const ch = CUR.ch, td = todoOf(ch);
  if (!td) return `<div class="card">${empty('Karakter seç', '')}</div>`;
  const now = Date.now(), r = todoReset();
  const day = td.items.filter(x => !x.off && x.per === 'g'), week = td.items.filter(x => !x.off && x.per === 'h');
  const s = todoStats(td, now), ws = { done: week.filter(x => todoIsDone(td, x, now)).length, total: week.length };
  const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
  const streak = todoStreak(td);
  // son 14 gün
  const bars = Array.from({ length: 14 }, (_, i) => { const d = new Date(todoDayKey() + 'T12:00'); d.setDate(d.getDate() - 13 + i); const k = localDate(d), h = td.hist[k]; return { k, d, v: h && h[1] ? h[0] / h[1] : 0, h }; });
  const others = (CUR.acc.chars || []).filter(c => c.id !== ch.id);
  const list = (items, per) => items.map(it => todoRow(td, it, now, ch.id)).join('') || `<div class="hint" style="padding:8px 2px">Madde yok · "Düzenle" ile ekle</div>`;
  return `<div class="grid td-top">
    <div class="card td-sum">
      <div class="td-ring" style="--p:${pct}"><b>${pct}%</b><span>bugün</span></div>
      <div class="td-meta">
        <h3>${esc(ch.name)} · ${s.done}/${s.total} günlük</h3>
        <div class="mut">Haftalık ${ws.done}/${ws.total} · Günlük sıfırlanma <b data-cd="${todoNextReset('g')}">${fmtCD(todoNextReset('g') - now)}</b></div>
        <div class="td-streak">${streak ? `🔥 <b>${streak} gün</b> üst üste tamamlandı` : 'Bugünü tamamla, seri başlasın'}</div>
        <div class="td-bars" aria-label="Son 14 gün">${bars.map(b => `<i title="${esc(fmtDate(b.k))}${b.h ? ` · ${b.h[0]}/${b.h[1]}` : ''}" style="--v:${b.v}" class="${b.v >= 1 ? 'full' : ''}"></i>`).join('')}</div>
      </div>
    </div>
  </div>
  <div class="grid g2 td-lists">
    <div class="card"><div class="card-h"><h3>Günlük</h3><span class="sub">${s.done}/${s.total}</span></div><div class="td-list">${list(day)}</div></div>
    <div class="card"><div class="card-h"><h3>Haftalık</h3><span class="sub">${ws.done}/${ws.total} · ${esc(DAYS[r.d])} sıfırlanır</span></div><div class="td-list">${list(week)}</div></div>
  </div>
  <div class="row td-bar">
    <button class="btn ${TD.edit ? 'pri' : ''}" data-act="td-edit">${TD.edit ? 'Bitti' : 'Düzenle'}</button>
    ${TD.edit ? `<button class="btn" data-act="td-add">${ICON.plus} Madde ekle</button><button class="btn ghost" data-act="td-defaults">Varsayılanları geri getir</button>` : ''}
    <span class="spacer"></span>
    <label class="f td-set">Günlük sıfırlanma<select class="inp" data-td-h>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === r.h ? 'selected' : ''}>${pad(h)}:00</option>`).join('')}</select></label>
    <label class="f td-set">Haftalık<select class="inp" data-td-d>${WEEK.map(d => `<option value="${d}" ${d === r.d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></label>
  </div>
  ${others.length ? `<div class="card td-others"><div class="card-h"><h3>Diğer karakterlerin</h3><span class="sub">bugün</span></div>
    ${others.map(c => { const t = todoOf(c), st = todoStats(t, now), left = t.items.filter(x => !x.off && x.per === 'g' && !todoIsDone(t, x, now));
      return `<div class="td-oc"><div class="td-ocn">${charAvatar(c, 26)}<b>${esc(c.name)}</b><span class="mut">Lv ${c.level}</span><span class="spacer"></span><span class="badge ${st.done >= st.total && st.total ? 'g' : ''}">${st.done}/${st.total}</span></div>
        ${left.length ? `<div class="td-chips">${left.map(it => `<label class="td-chip"><input type="checkbox" data-td="${esc(it.id)}" data-td-ch="${esc(c.id)}"> ${esc(it.t)}</label>`).join('')}</div>` : '<div class="hint">Bugünkü hepsi tamam ✓</div>'}</div>`; }).join('')}
  </div>` : ''}
  <p class="hint" style="margin-top:12px">Liste karakter başınadır ve hesabınla buluta kaydedilir. Event maddelerinin yanında o eventin sıradaki saati görünür.</p>`;
};

Object.assign(ACTIONS, {
  'td-edit': () => { TD.edit = !TD.edit; render(); },
  'td-add': () => openForm({ title: 'Madde ekle', data: { t: '', per: 'g', pid: '' },
    fields: [
      { k: 't', label: 'Ne yapılacak?', type: 'text', full: true, placeholder: 'örn. Krowaz boss\'ları' },
      { k: 'per', label: 'Ne sıklıkla', type: 'select', options: [['g', 'Her gün'], ['h', 'Her hafta']] },
      { k: 'pid', label: 'Bağlı event (isteğe bağlı)', type: 'select', options: [['', '—'], ...(typeof EVENT_GUIDES !== 'undefined' ? EVENT_GUIDES.map(g => [g.pid, g.n]) : [])] },
    ],
    onSave: v => {
      if (!v.t.trim()) { toast('Madde adı gir', 'err'); return false; }
      const td = todoOf(CUR.ch);
      td.items.push({ id: uid(), t: v.t.trim().slice(0, 60), per: v.per === 'h' ? 'h' : 'g', ...(v.pid ? { pid: v.pid } : {}) });
      todoRecord(td); save(); render();
    } }),
  'td-del': el => { const td = todoOf(CUR.ch); td.items = td.items.filter(x => x.id !== el.dataset.id); delete td.done[el.dataset.id]; todoRecord(td); save(); render(); },
  'td-defaults': () => confirmBox('Varsayılanları geri getir', 'Eksik varsayılan maddeler listeye eklenir; kendi eklediklerin silinmez.', 'Ekle', () => {
    const td = todoOf(CUR.ch);
    TODO_DEF.forEach(x => { if (!td.items.some(y => y.id === x.id)) td.items.push({ ...x }); });
    todoRecord(td); save(); render();
  }),
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.td != null) {
    const ch = (CUR.acc.chars || []).find(c => c.id === d.tdCh) || CUR.ch, td = todoOf(ch), it = td && td.items.find(x => x.id === d.td);
    if (!it) return;
    if (e.target.checked) td.done[it.id] = todoKey(it.per); else delete td.done[it.id];
    todoRecord(td); save(); render();
  }
  if (d.tdH != null || d.tdD != null) {
    DB.shared.todoReset = Object.assign(todoReset(), d.tdH != null ? { h: +e.target.value } : { d: +e.target.value });
    save(); render();
  }
});
