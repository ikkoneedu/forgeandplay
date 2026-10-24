'use strict';
/* ==========================================================================
   GRIND TAKİBİ
   Kasılmaya başlarken "Başlat", bitince "Bitir": süre (duraklatmalar hariç),
   kazanılan EXP (seviye atlasa da), net noah, masraf ve düşen itemler.
   Bölgelere göre saatlik EXP ve noah karşılaştırması.
     ch.data.grind = { live: { st, lv, pct, place, pausedMs, pauseAt } | null,
                       list: [{ id, st, en, min, lv, a, lv2, b, exp, place, noah, cost, items, note }] }
   Canlı oturum karakter verisinde durur: telefonda başlatıp bilgisayarda bitirebilirsin.
   Bitirince aynı seviyedeki oturum EXP sayfasındaki "Oturum kaydı"na, net noah isteğe
   bağlı olarak Gelir / Gider defterine yazılır.
   ========================================================================== */
const GR_PLACES = ['Eslant', 'Ardream', 'Ronark Land', 'Luferson Castle', 'El Morad Castle', 'Krowaz', 'Lunar Valley', 'Hell Abyss', 'Isillion Lair', 'Delos', 'Moradon'];
function grindOf(ch = CUR.ch) {
  if (!ch || !ch.data) return null;
  const g = ch.data.grind || (ch.data.grind = { live: null, list: [] });
  if (!Array.isArray(g.list)) g.list = [];
  return g;
}
/** duraklatmalar hariç geçen süre (ms) */
function grElapsed(l, now = Date.now()) {
  if (!l) return 0;
  return Math.max(0, (l.pauseAt || now) - l.st - (l.pausedMs || 0));
}
/** a% (lv) → b% (lv2) arası EXP; seviye atlasa da */
function grExp(lv, a, lv2, b) {
  lv = Math.round(lv); lv2 = Math.round(lv2);
  if (lv2 < lv || (lv2 === lv && b <= a)) return 0;
  if (lv2 === lv) return xpNeed(lv) * (b - a) / 100;
  let e = xpNeed(lv) * (100 - a) / 100;
  for (let x = lv + 1; x < lv2; x++) e += xpNeed(x);
  return e + xpNeed(lv2) * b / 100;
}
const grFmtH = ms => { const m = Math.floor(ms / 60000); return Math.floor(m / 60) + ' sa ' + pad(m % 60) + ' dk'; };
const grClock = ms => { const s = Math.floor(ms / 1000); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); };

/* ---------- işlemler ---------- */
function grStart(v) {
  const g = grindOf(); if (g.live) return;
  g.live = { st: Date.now(), lv: Math.round(parseNum(v.lv)) || CUR.ch.level || 1, pct: clamp(parseNum(v.pct), 0, 100), place: String(v.place || '').trim().slice(0, 40), pausedMs: 0, pauseAt: 0 };
  save(); render(); toast('Grind başladı · iyi kasılmalar', 'ok');
}
function grPause() {
  const l = grindOf().live; if (!l) return;
  if (l.pauseAt) { l.pausedMs = (l.pausedMs || 0) + Date.now() - l.pauseAt; l.pauseAt = 0; toast('Devam', 'ok'); }
  else { l.pauseAt = Date.now(); toast('Duraklatıldı'); }
  save(); render();
}
function grFinishForm() {
  const g = grindOf(), l = g.live; if (!l) return;
  const min = Math.max(1, Math.round(grElapsed(l) / 60000));
  openForm({
    title: `Grind bitti · ${grFmtH(min * 60000)}`,
    data: { lv2: String(l.lv), b: '', noah: '', cost: '', items: '', note: '', kasa: '1', min: String(min) },
    fields: [
      { k: 'lv2', label: 'Bitiş seviyesi', type: 'number' },
      { k: 'b', label: 'Bitiş EXP %', type: 'number', placeholder: `başlangıç %${fmtX(l.pct)}` },
      { k: 'noah', label: 'Kazanılan noah (yerden + satış)', type: 'money' },
      { k: 'cost', label: 'Masraf (pot, scroll, tamir…)', type: 'money' },
      { k: 'min', label: 'Süre (dakika)', type: 'number', hint: 'Duraklatmalar düşüldü; gerekirse düzelt' },
      { k: 'kasa', label: 'Gelir / gider defterine yaz', type: 'select', options: [['1', 'Evet (net noah)'], ['', 'Hayır']] },
      { k: 'items', label: 'Düşen itemler', type: 'text', full: true, placeholder: 'örn. 2 Iron Bar, 1 Blessed Scroll' },
      { k: 'note', label: 'Not', type: 'text', full: true },
    ],
    onSave: v => {
      const lv2 = Math.round(parseNum(v.lv2)) || l.lv, b = clamp(parseNum(v.b), 0, 100);
      if (v.b === '' || isNaN(parseNum(v.b))) { toast('Bitiş yüzdesini gir', 'err'); return false; }
      if (lv2 < l.lv || (lv2 === l.lv && b < l.pct)) { toast('Bitiş, başlangıçtan geride olamaz', 'err'); return false; }
      const minutes = Math.max(1, Math.round(parseNum(v.min)) || min);
      const noah = parseAmt(v.noah) || 0, cost = parseAmt(v.cost) || 0;
      const rec = { id: uid(), st: l.st, en: Date.now(), min: minutes, lv: l.lv, a: l.pct, lv2, b, exp: Math.round(grExp(l.lv, l.pct, lv2, b)), place: l.place, noah, cost, items: String(v.items || '').trim().slice(0, 200), note: String(v.note || '').trim().slice(0, 200) };
      g.list.push(rec); if (g.list.length > 300) g.list.splice(0, g.list.length - 300);
      g.live = null;
      // aynı seviyede kaldıysa EXP sayfasındaki oturum kaydına da
      if (lv2 === l.lv && b > l.pct) S.exp.sessions.push({ id: uid(), date: localDate(), level: l.lv, startPct: l.pct, endPct: b, minutes, src: 'grind' });
      // karakterin seviyesi ve EXP sayfasındaki yüzdesi
      if (lv2 > (CUR.ch.level || 0)) CUR.ch.level = lv2;
      if (S.exp.calc) { if (lv2 > (+S.exp.calc.level || 0)) S.exp.calc.level = lv2; if (+S.exp.calc.level === lv2) S.exp.calc.cur = b; }
      if (v.kasa && (noah || cost)) {
        const net = noah - cost;
        S.tx.push({ id: uid(), date: localDate(), type: net >= 0 ? 'gelir' : 'gider', cat: net >= 0 ? 'Farm' : 'Masraf', desc: `Grind${l.place ? ' · ' + l.place : ''} · ${grFmtH(minutes * 60000)}`, amount: Math.abs(net), unit: 'noah' });
      }
      save(); render();
      toast(`Kaydedildi: ${rec.exp ? fmtShort(rec.exp) + ' EXP · ' : ''}${fmtShort(noah - cost)} net noah`, 'ok');
    },
  });
}

/* ---------- görünüm ---------- */
ICON.grind = I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6M12 2v3"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'exp'), 0, { id: 'grind', t: 'Grind Takibi', d: 'Kasılma süresi, saatlik EXP ve noah · bölgelere göre verim' });

function grStats(list) {
  const min = sum(list, x => x.min), h = min / 60;
  const exp = sum(list, x => x.exp || 0), net = sum(list, x => (x.noah || 0) - (x.cost || 0));
  return { n: list.length, h, exp, net, eh: h ? exp / h : 0, nh: h ? net / h : 0 };
}
VIEWS.grind = () => {
  const g = grindOf(); if (!g) return `<div class="card">${empty('Karakter seç', '')}</div>`;
  const l = g.live, now = Date.now();
  const places = [...new Set([...g.list.map(x => x.place).filter(Boolean).reverse(), ...GR_PLACES])];
  const last = g.list.slice().reverse()[0];
  const live = l ? `<section class="card gr-live ${l.pauseAt ? 'paused' : ''}">
      <div class="gr-clock"><b data-gr-clock>${grClock(grElapsed(l, now))}</b><span>${l.pauseAt ? 'duraklatıldı' : 'kasılıyor'}</span></div>
      <div class="gr-info"><h3>${esc(l.place || 'Grind')}</h3><div class="mut">Lv ${l.lv} · başlangıç %${fmtX(l.pct)} · ${new Date(l.st).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'de başladı</div></div>
      <div class="gr-btns">
        <button class="btn" data-act="gr-pause">${l.pauseAt ? '▶ Devam' : '⏸ Duraklat'}</button>
        <button class="btn pri" data-act="gr-finish">■ Bitir</button>
        <button class="btn ghost danger" data-act="gr-cancel">İptal</button>
      </div>
    </section>`
    : `<section class="card gr-start">
      <div><h3>Grind başlat</h3><span class="mut">Kasılmaya başlarken bas; bitince yüzdeni ve kazancını gir.</span></div>
      <div class="gr-form">
        <label class="f">Yer<input class="inp" id="grPlace" list="gr-pl" value="${esc((last && last.place) || '')}" placeholder="örn. Eslant" maxlength="40"></label>
        <label class="f">Seviye<input class="inp num" id="grLv" value="${esc(CUR.ch.level || '')}"></label>
        <label class="f">Başlangıç %<input class="inp num" id="grPct" value="${esc(last && last.lv2 === CUR.ch.level ? last.b : (S.exp.calc && +S.exp.calc.level === CUR.ch.level ? S.exp.calc.cur || '' : ''))}" placeholder="örn. 42,5"></label>
        <button class="btn pri" data-act="gr-start">▶ Başlat</button>
      </div>
      <datalist id="gr-pl">${places.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    </section>`;
  const d7 = g.list.filter(x => x.en >= now - 7 * 864e5), d30 = g.list.filter(x => x.en >= now - 30 * 864e5);
  const s7 = grStats(d7), s30 = grStats(d30);
  const byPlace = Object.entries(d30.reduce((o, x) => { (o[x.place || '—'] = o[x.place || '—'] || []).push(x); return o; }, {}))
    .map(([p, xs]) => ({ p, ...grStats(xs) })).sort((a, b) => b.eh - a.eh);
  const best = byPlace.filter(x => x.h >= 0.5)[0];
  const stat = (t, v, sub, glow) => `<div class="card stat" style="--glow:${glow}"><div class="lbl">${t}</div><div class="val">${v}</div><div class="sub2">${sub}</div></div>`;
  return live + (g.list.length ? `
  <div class="grid g4 gr-stats">
    ${stat('Son 7 gün', s7.h ? fmtX(Math.round(s7.h * 10) / 10) + ' sa' : '—', `${s7.n} oturum`, 'var(--blue)')}
    ${stat('Saatte EXP (7 gün)', s7.eh ? fmtShort(s7.eh) : '—', s7.exp ? fmtShort(s7.exp) + ' toplam' : 'EXP girilmedi', 'var(--gold)')}
    ${stat('Saatte net noah (7 gün)', s7.h ? moneyHTML(s7.nh, { short: true }) : '—', s7.net ? fmtShort(s7.net) + ' net' : '', 'var(--green)')}
    ${stat('En verimli yer (30 gün)', best ? esc(best.p) : '—', best ? fmtShort(best.eh) + ' EXP/sa · ' + fmtShort(best.nh) + ' noah/sa' : 'en az 30 dk kayıt gerekir', 'var(--purple, #a58bff)')}
  </div>
  <div class="grid g-wide gr-grid">
    <div class="card" style="padding:0;overflow:hidden">
      <div class="card-h" style="padding:14px 18px 0"><h3>Oturumlar</h3><span class="sub">${g.list.length}</span></div>
      <div class="tbl-wrap" style="border:0;border-radius:0;border-top:1px solid var(--line);max-height:520px"><table>
        <thead><tr><th>Tarih</th><th>Yer</th><th class="num">Süre</th><th class="num">EXP</th><th class="num">EXP/sa</th><th class="num">Net noah</th><th></th></tr></thead>
        <tbody>${g.list.slice().reverse().slice(0, 100).map(x => { const h = x.min / 60, net = (x.noah || 0) - (x.cost || 0); return `<tr>
          <td class="mut">${fmtDate(localDate(new Date(x.en)))}<div class="hint">${new Date(x.st).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div></td>
          <td>${esc(x.place || '—')}<div class="hint">Lv ${x.lv} %${fmtX(x.a)} → ${x.lv2 !== x.lv ? 'Lv ' + x.lv2 + ' ' : ''}%${fmtX(x.b)}</div>${x.items ? `<div class="hint">${esc(x.items)}</div>` : ''}</td>
          <td class="num">${grFmtH(x.min * 60000)}</td>
          <td class="num">${x.exp ? fmtShort(x.exp) : '—'}</td>
          <td class="num gold">${x.exp && h ? fmtShort(x.exp / h) : '—'}</td>
          <td class="num">${net ? moneyHTML(net, { sign: true, short: true }) : '<span class="mut">—</span>'}</td>
          <td class="gr-rb">${ICON.share ? `<button class="icon-btn" data-act="sh-grind" data-id="${esc(x.id)}" title="Paylaş" aria-label="Paylaş">${ICON.share}</button>` : ''}<button class="icon-btn" data-act="gr-del" data-id="${esc(x.id)}" title="Sil" aria-label="Sil">${ICON.del}</button></td></tr>`; }).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Bölgelere göre</h3><span class="sub">son 30 gün</span></div>
      ${byPlace.length ? `<div class="gr-places">${byPlace.map(x => `<div class="gr-pl"><div><b>${esc(x.p)}</b><span class="mut">${x.n} oturum · ${fmtX(Math.round(x.h * 10) / 10)} sa</span></div>
        <div class="gr-pv"><span>${x.eh ? fmtShort(x.eh) : '—'}<small>EXP/sa</small></span><span>${x.h ? fmtShort(x.nh) : '—'}<small>noah/sa</small></span></div>
        <div class="gr-pb"><i style="width:${byPlace[0].eh ? Math.round(x.eh / byPlace[0].eh * 100) : 0}%"></i></div></div>`).join('')}</div>` : '<div class="mut">Son 30 günde kayıt yok.</div>'}
      <div class="hint" style="margin-top:10px">Yer adlarını aynı yazarsan karşılaştırma doğru çıkar.</div>
    </div>
  </div>` : `<div class="card" style="margin-top:12px">${empty('Henüz grind kaydı yok', 'Kasılmaya başlarken "Başlat"a bas. Bitince EXP yüzdeni ve kazandığın noah\'ı girersin; saatlik verimin ve en verimli bölgen burada çıkar.')}</div>`);
};
setInterval(() => {
  if (ui.page !== 'grind') return;
  const el = document.querySelector('[data-gr-clock]'), g = grindOf();
  if (el && g && g.live) el.textContent = grClock(grElapsed(g.live));
}, 1000);

Object.assign(ACTIONS, {
  'gr-start': () => {
    const pct = ($('#grPct') || {}).value;
    if (pct === '' || isNaN(parseNum(pct))) return toast('Başlangıç yüzdeni gir', 'err');
    grStart({ place: ($('#grPlace') || {}).value, lv: ($('#grLv') || {}).value, pct });
  },
  'gr-pause': () => grPause(),
  'gr-finish': () => grFinishForm(),
  'gr-cancel': () => confirmBox('Grind iptal', 'Bu oturum kaydedilmeden silinecek.', 'İptal et', () => { grindOf().live = null; save(); render(); }),
  'gr-del': el => confirmBox('Oturumu sil', 'Bu grind kaydı silinsin mi? (Gelir / gider defterine yazılan kayıt ayrıca silinmez.)', 'Sil', () => {
    const g = grindOf(); g.list = g.list.filter(x => x.id !== el.dataset.id); save(); render();
  }),
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'grPct') ACTIONS['gr-start'](); });
