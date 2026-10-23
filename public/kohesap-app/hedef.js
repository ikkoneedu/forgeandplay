'use strict';
/* ==========================================================================
   HEDEF LİSTESİ (set / build planlayıcı)
   Karakter için alınacak itemler: adet, birim fiyat (elle ya da fiyat listesinden,
   canlı pazar fiyat listesini güncelledikçe kendiliğinden), alındı işareti.
   Toplam / kalan maliyet noah, GB ve TL olarak; biriktirilen paraya göre eksik
   ve grind ortalamasına göre tahmini süre.
     ch.data.hedef = { saved: noah, list: [{ id, name, qty, unit, grp, done, note }] }
   unit = 0 → fiyat listesindeki fiyat kullanılır.
   ========================================================================== */
const HD_GROUPS = ['Silah', 'Zırh', 'Takı', 'Pet & Görünüm', 'Scroll & Malzeme', 'Diğer'];
const HD = { hideDone: false };
function hedefOf(ch = CUR.ch) {
  if (!ch || !ch.data) return null;
  const h = ch.data.hedef || (ch.data.hedef = { saved: 0, list: [] });
  if (!Array.isArray(h.list)) h.list = [];
  h.saved = Math.max(0, +h.saved || 0);
  return h;
}
/** birim fiyat ve kaynağı: elle girilen > fiyat listesi */
function hdPrice(it) {
  if (it.unit > 0) return { v: it.unit, src: 'elle' };
  const p = S.prices.find(x => trLow(x.name) === trLow(it.name));
  if (p && p.price > 0) return { v: p.price, src: 'liste', upd: p.updated };
  return { v: 0, src: '' };
}
function hdTotals(h) {
  let all = 0, done = 0, missing = 0;
  h.list.forEach(it => {
    const t = hdPrice(it).v * (it.qty || 1);
    if (!hdPrice(it).v && !it.done) missing++;
    all += t; if (it.done) done += t;
  });
  const left = all - done, need = Math.max(0, left - h.saved);
  return { all, done, left, need, missing, n: h.list.length, nDone: h.list.filter(x => x.done).length };
}
/** grind ortalamasıyla saatlik net noah (en az 1 saatlik kayıt varsa) */
function hdRate(ch = CUR.ch) {
  if (typeof grindOf !== 'function' || typeof grStats !== 'function') return 0;
  const g = grindOf(ch); if (!g || !g.list.length) return 0;
  const s = grStats(g.list.slice(-30));
  return s.h >= 1 && s.nh > 0 ? s.nh : 0;
}
const hdMoney = n => `${fmtShort(n)}<span class="hd-sub">${S.settings.gbTL ? fmtTL(gbOf(n) * S.settings.gbTL) : fmtX(Math.round(gbOf(n) * 100) / 100) + ' GB'}</span>`;

/* ---------- görünüm ---------- */
ICON.hedef = I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'pus'), 0, { id: 'hedef', t: 'Hedef Listesi', d: 'Alınacak set / itemler, toplam maliyet ve eksik para · fiyatlar fiyat listenden gelir' });

function hdRow(it) {
  const pr = hdPrice(it), tot = pr.v * (it.qty || 1);
  const ic = typeof itemIconPath === 'function' && typeof itemIcon === 'function' ? itemIcon(itemIconPath(it.name), it.name, 34) : '';
  return `<div class="hd-row ${it.done ? 'on' : ''}">
    <label class="hd-ck" title="Alındı"><input type="checkbox" data-hd-done="${esc(it.id)}" ${it.done ? 'checked' : ''}></label>
    ${ic}
    <div class="hd-nm"><b>${esc(it.name)}</b>${it.qty > 1 ? ` <span class="badge">×${fmtN(it.qty)}</span>` : ''}
      <div class="hint">${pr.v ? `${fmtShort(pr.v)} / adet · ${pr.src === 'elle' ? 'elle girildi' : `fiyat listesi${pr.upd ? ' · ' + esc(fmtDate(pr.upd)) : ''}`}` : '<span class="hd-warn">fiyat yok · düzenleyip gir ya da fiyat listesine ekle</span>'}${it.note ? ' · ' + esc(it.note) : ''}</div></div>
    <div class="hd-tot num">${pr.v ? hdMoney(tot) : '—'}</div>
    <div class="hd-act">
      <button class="icon-btn" data-act="hd-edit" data-id="${esc(it.id)}" title="Düzenle" aria-label="Düzenle">${ICON.edit}</button>
      <button class="icon-btn danger" data-act="hd-del" data-id="${esc(it.id)}" title="Sil" aria-label="Sil">${ICON.del}</button>
    </div>
  </div>`;
}
VIEWS.hedef = () => {
  const ch = CUR.ch, h = hedefOf(ch);
  if (!h) return `<div class="card">${empty('Karakter seç', '')}</div>`;
  const t = hdTotals(h), rate = hdRate(ch);
  const pct = t.all ? Math.round(Math.min(t.all, t.done + h.saved) / t.all * 100) : 0;
  const groups = [...new Set([...HD_GROUPS, ...h.list.map(x => x.grp || 'Diğer')])];
  const vis = h.list.filter(x => !HD.hideDone || !x.done);
  const body = groups.map(g => {
    const items = vis.filter(x => (x.grp || 'Diğer') === g); if (!items.length) return '';
    const sub = sum(items.filter(x => !x.done), x => hdPrice(x).v * (x.qty || 1));
    return `<div class="hd-grp"><div class="hd-gh"><b>${esc(g)}</b><span class="mut">${sub ? 'kalan ' + fmtShort(sub) : 'tamam ✓'}</span></div>${items.map(hdRow).join('')}</div>`;
  }).join('');
  const eta = t.need && rate ? t.need / rate : 0;
  return `<div class="grid hd-top">
    <div class="card hd-sum">
      <div class="td-ring" style="--p:${pct}"><b>${pct}%</b><span>hazır</span></div>
      <div class="hd-kpis">
        <div><span>Toplam</span><b>${hdMoney(t.all)}</b></div>
        <div><span>Alınan</span><b>${hdMoney(t.done)}</b></div>
        <div><span>Kalan</span><b>${hdMoney(t.left)}</b></div>
        <div class="${t.need ? 'neg' : 'pos'}"><span>Eksik para</span><b>${t.need ? hdMoney(t.need) : 'yok ✓'}</b></div>
      </div>
    </div>
    <div class="card hd-save">
      <label class="f">Biriktirdiğim (noah)<input class="inp num" data-hd-saved value="${h.saved ? esc(fmtN(h.saved)) : ''}" placeholder="örn. 750m" inputmode="decimal"></label>
      <div class="hint">${t.need
        ? (eta ? `Grind ortalamanla (${fmtShort(rate)} / saat net) yaklaşık <b>${grFmtH(eta * 3600e3)}</b> kasman gerekiyor.` : 'Grind takibinde en az 1 saatlik kayıt olunca tahmini süre burada görünür.')
        : t.n ? 'Kalan her şey için paran yetiyor.' : ''}${t.missing ? ` <span class="hd-warn">${t.missing} itemin fiyatı yok; toplam eksik olabilir.</span>` : ''}</div>
    </div>
  </div>
  <div class="row hd-bar">
    <button class="btn pri" data-act="hd-add">${ICON.plus} Item ekle</button>
    <button class="btn" data-act="hd-copy" ${(CUR.acc.chars || []).length > 1 ? '' : 'hidden'}>Başka karaktere kopyala</button>
    <span class="spacer"></span>
    <label class="check"><input type="checkbox" data-hd-hide ${HD.hideDone ? 'checked' : ''}> Alınanları gizle</label>
    ${t.n ? `<button class="btn ghost" data-act="hd-csv">CSV</button>` : ''}
  </div>
  <div class="card hd-list">${t.n ? (body || '<div class="hint" style="padding:8px">Hepsi alındı ✓</div>') : empty('Hedef listen boş', `<div class="mut">Almak istediğin seti ekle: "Item ekle" → adı yaz (öneri çıkar), adet gir. Fiyatı fiyat listende varsa kendiliğinden gelir; canlı pazardan fiyat güncelledikçe toplam da güncellenir.</div>`)}</div>
  <p class="hint" style="margin-top:12px">Liste karakter başınadır ve hesabınla buluta kaydedilir. TL karşılığı Ayarlar'daki GB fiyatıyla hesaplanır.</p>`;
};

function hdForm(it) {
  const isNew = !it;
  const pr = it ? hdPrice({ ...it, unit: 0 }) : { v: 0 };
  openForm({
    title: isNew ? 'Hedefe item ekle' : 'Hedef itemi düzenle',
    data: it ? { name: it.name, qty: it.qty || 1, unit: it.unit ? fmtN(it.unit) : '', grp: it.grp || 'Diğer', note: it.note || '' } : { name: '', qty: 1, unit: '', grp: 'Diğer', note: '' },
    fields: [
      { k: 'name', label: 'Item', type: 'text', full: true, ac: 'item', placeholder: 'örn. Raptor +7' },
      { k: 'qty', label: 'Adet', type: 'number' },
      { k: 'grp', label: 'Grup', type: 'select', options: HD_GROUPS.map(g => [g, g]) },
      { k: 'unit', label: `Birim fiyat (boş bırakırsan fiyat listesinden${pr.v ? ': ' + fmtShort(pr.v) : ''})`, type: 'money', full: true },
      { k: 'note', label: 'Not', type: 'text', full: true, placeholder: 'örn. reverse olsun, NP\'li' },
    ],
    onSave: v => {
      const name = String(v.name || '').trim().slice(0, 80);
      if (!name) { toast('Item adı gir', 'err'); return false; }
      const h = hedefOf();
      const o = { name, qty: clamp(Math.round(parseNum(v.qty)) || 1, 1, 9999), unit: Math.max(0, Math.round(parseAmt(v.unit) || 0)), grp: HD_GROUPS.includes(v.grp) ? v.grp : 'Diğer', note: String(v.note || '').trim().slice(0, 80) };
      if (isNew) h.list.push({ id: uid(), done: false, ...o }); else Object.assign(it, o);
      save(); render();
    },
  });
}
Object.assign(ACTIONS, {
  'hd-add': () => hdForm(null),
  'hd-edit': el => { const it = hedefOf().list.find(x => x.id === el.dataset.id); if (it) hdForm(it); },
  'hd-del': el => { const h = hedefOf(); h.list = h.list.filter(x => x.id !== el.dataset.id); save(); render(); },
  'hd-csv': () => { const h = hedefOf(); csv(`hedef-${CUR.ch.name}.csv`, ['Item', 'Grup', 'Adet', 'Birim', 'Toplam', 'Alındı', 'Not'], h.list.map(x => { const p = hdPrice(x).v; return [x.name, x.grp || 'Diğer', x.qty || 1, p, p * (x.qty || 1), x.done ? 'evet' : 'hayır', x.note || '']; })); },
  'hd-copy': () => {
    const others = (CUR.acc.chars || []).filter(c => c.id !== CUR.ch.id); if (!others.length) return;
    openForm({ title: 'Hedef listesini kopyala', data: { to: others[0].id },
      fields: [{ k: 'to', label: 'Hangi karaktere', type: 'select', options: others.map(c => [c.id, `${c.name} · Lv ${c.level}`]) }],
      onSave: v => {
        const to = others.find(c => c.id === v.to); if (!to) return false;
        const src = hedefOf(), dst = hedefOf(to);
        src.list.forEach(x => { if (!dst.list.some(y => trLow(y.name) === trLow(x.name))) dst.list.push({ ...x, id: uid(), done: false }); });
        save(); toast(`${to.name} hedef listesine kopyalandı`, 'ok');
      } });
  },
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.hdDone != null) { const it = hedefOf().list.find(x => x.id === d.hdDone); if (it) { it.done = e.target.checked; save(); render(); } }
  else if (d.hdHide != null) { HD.hideDone = e.target.checked; render(); }
  else if (d.hdSaved != null) { hedefOf().saved = Math.max(0, Math.round(parseAmt(e.target.value) || 0)); save(); render(); }
});
