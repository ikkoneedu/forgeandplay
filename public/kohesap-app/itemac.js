'use strict';
/* ==========================================================================
   KO Ekip — item adı otomatik tamamlama
   data-ac="item" olan her kutuda 2 harf yazınca öneri listesi açılır.
   Kaynak: itemdb.js (oyunun item tablosu) + PUS kataloğu + fiyat listem
   + site ilanlarından öğrenilen adlar. "+7", "Rev." gibi ekler korunur.
   ========================================================================== */
const AC = { el: null, pop: null, list: [], idx: -1, learned: new Set() };
const acKey = s => trLow(s).replace(/ı/g, 'i').replace(/[^a-z0-9ğüşöç]+/g, ' ').trim();

let _acIndex = null;
function acIndex() {
  if (_acIndex) return _acIndex;
  const m = new Map();
  const add = (n, meta) => { const k = acKey(n); if (k.length >= 2 && !m.has(k)) m.set(k, { n, k, ...meta }); };
  try { (S.pus.catalog || []).forEach(x => add(x.name, { c: 'PUS', kc: x.kc })); } catch { }
  if (typeof ITEMDB !== 'undefined') for (const [n, c, lv, mx, ic] of ITEMDB) add(n, { c: ITEMDB_CATS[c], lv, mx, ic });
  AC.learned.forEach(n => add(n, { c: 'İlan' }));
  _acIndex = [...m.values()];
  return _acIndex;
}
/** Item adından oyun ikonu yolu: "Rev. Raptor (+7)" → /ItemIcon/itemicon_1_5621_00_0.jpg */
const acBase = n => String(n || '').replace(/\(?\+\s?\d+\)?/g, ' ').replace(/\(?\breverse\b\)?|\brev\b\.?/gi, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
let _icMap = null;
function itemIconPath(name) {
  if (!_icMap) { _icMap = new Map(); if (typeof ITEMDB !== 'undefined') for (const r of ITEMDB) if (r[4] && acKey(r[0])) _icMap.set(acKey(r[0]), r[4]); }
  const k = acKey(acBase(name)); if (!k) return '';
  const ic = _icMap.get(k);
  return ic ? `/ItemIcon/itemicon_${ic}.jpg` : '';
}
/** Site ilanlarından gelen yeni item adlarını öğren (oyunda yeni çıkmış itemler) */
function acLearn(names) {
  let n = 0;
  const known = new Set(acIndex().map(x => x.k));
  for (const x of names || []) {
    const b = String(x || '').replace(/\(?\+\s?\d+\)?/g, ' ').replace(/\(?\breverse\b\)?|\brev\b\.?/gi, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (b.length > 2 && b.length < 60 && !AC.learned.has(b) && !known.has(acKey(b))) { AC.learned.add(b); n++; }
  }
  if (n) _acIndex = null;
}
/** "rev raptor +7" → { pre: 'Rev. ', q: 'raptor', post: ' (+7)' } */
function acSplit(v) {
  let s = String(v || ''), pre = '', post = '';
  const r = s.match(/^\s*(rev(?:erse)?\.?)\s+/i); if (r) { pre = 'Rev. '; s = s.slice(r[0].length); }
  const p = s.match(/\s*\(?\+(\d{1,2})\)?\s*$/); if (p) { post = ` (+${p[1]})`; s = s.slice(0, p.index); }
  return { pre, q: s.trim(), post };
}
function acSearch(q, max = 12) {
  const k = acKey(q); if (k.length < 2) return [];
  const own = (S.prices || []).map(p => ({ n: p.name, k: acKey(p.name), c: 'Fiyat listem', price: p.price }));
  const out = [], seen = new Set();
  const push = (x, s) => { if (!seen.has(x.k)) { seen.add(x.k); out.push({ ...x, s }); } };
  const words = k.split(' ');
  for (const src of [own, acIndex()]) for (const x of src) {
    if (x.k.startsWith(k)) push(x, 0);
    else if (x.k.split(' ').some(w => w.startsWith(k))) push(x, 1);
    else if (words.every(w => x.k.includes(w))) push(x, 2);
  }
  return out.sort((a, b) => a.s - b.s || (a.c === 'Fiyat listem' ? -1 : 0) - (b.c === 'Fiyat listem' ? -1 : 0) || a.n.length - b.n.length).slice(0, max);
}
function acClose() { if (AC.pop) AC.pop.remove(); AC.pop = null; AC.list = []; AC.idx = -1; }
function acOpen(el) {
  const { pre, q, post } = acSplit(el.value);
  AC.el = el; AC.list = acSearch(q);
  if (!AC.list.length) return acClose();
  if (!AC.pop) { AC.pop = document.createElement('div'); AC.pop.className = 'ac-pop'; AC.pop.setAttribute('role', 'listbox'); document.body.appendChild(AC.pop); }
  AC.idx = Math.min(AC.idx, AC.list.length - 1);
  AC.pop.innerHTML = AC.list.map((x, i) => `<div class="ac-it ${i === AC.idx ? 'on' : ''}" data-aci="${i}" role="option">
    ${typeof itemIcon === 'function' ? itemIcon(x.ic ? `/ItemIcon/itemicon_${x.ic}.jpg` : itemIconPath(x.n), x.n, 30, 'ac-ic') : ''}<div class="ac-tx"><b>${esc(pre)}${acMark(x.n, q)}${esc(post)}</b>
    <span class="ac-meta">${esc(x.c || '')}${x.lv ? ' · Lv ' + x.lv : ''}${x.mx ? ' · +' + x.mx : ''}${x.price ? ' · ' + fmtShort(x.price) : ''}${x.kc ? ' · ' + x.kc + ' KC' : ''}</span></div></div>`).join('');
  acPlace();
}
function acMark(n, q) {
  const i = acKey(n).indexOf(acKey(q));
  if (i < 0 || acKey(n).length !== n.length) return esc(n);
  return esc(n.slice(0, i)) + '<u>' + esc(n.slice(i, i + q.length)) + '</u>' + esc(n.slice(i + q.length));
}
function acPlace() {
  if (!AC.pop || !AC.el || !AC.el.isConnected) return acClose();
  const r = AC.el.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : innerHeight;
  const below = vh - r.bottom, h = Math.min(320, AC.list.length * 46 + 8);
  AC.pop.style.left = Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 260) - 8)) + 'px';
  AC.pop.style.width = Math.max(r.width, 260) + 'px';
  if (below < h + 8 && r.top > below) { AC.pop.style.top = ''; AC.pop.style.bottom = (innerHeight - r.top + 4) + 'px'; }
  else { AC.pop.style.bottom = ''; AC.pop.style.top = (r.bottom + 4) + 'px'; }
}
function acPick(i) {
  const x = AC.list[i], el = AC.el; if (!x || !el) return;
  const { pre, post } = acSplit(el.value);
  el.value = pre + x.n + post;
  AC.picked = el.value;
  acClose();
  AC.picking = true;
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new CustomEvent('ac-pick', { bubbles: true, detail: x }));
  } finally { AC.picking = false; }
  try { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } catch { }
}
const isAc = el => el && el.matches && el.matches('input[data-ac="item"]');
document.addEventListener('input', e => { if (isAc(e.target) && !AC.picking) { AC.idx = -1; acOpen(e.target); } }, true);
// yalnızca kullanıcı kutuya tıklayınca açılır (yeniden çizimden sonra odak geri verilince açılmaz)
document.addEventListener('pointerdown', e => { if (isAc(e.target) && acSplit(e.target.value).q.length >= 2 && e.target.value !== AC.picked) setTimeout(() => { if (document.activeElement === e.target) { AC.idx = -1; acOpen(e.target); } }, 0); });
document.addEventListener('focusout', e => { if (isAc(e.target)) setTimeout(() => { if (document.activeElement !== AC.el) acClose(); }, 150); });
document.addEventListener('keydown', e => {
  if (!AC.pop || e.target !== AC.el) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.idx = (AC.idx + (e.key === 'ArrowDown' ? 1 : -1) + AC.list.length) % AC.list.length; acOpen(AC.el); }
  else if (e.key === 'Enter' && AC.idx >= 0) { e.preventDefault(); e.stopImmediatePropagation(); acPick(AC.idx); }
  else if (e.key === 'Escape') { e.stopImmediatePropagation(); acClose(); }
  else if (e.key === 'Tab' && AC.list.length) { acPick(Math.max(0, AC.idx)); }
}, true);
document.addEventListener('pointerdown', e => {
  const it = e.target.closest && e.target.closest('.ac-it');
  if (it) { e.preventDefault(); acPick(+it.dataset.aci); return; }
  if (AC.pop && !e.target.closest('.ac-pop') && e.target !== AC.el) acClose();
}, true);
addEventListener('scroll', () => AC.pop && acPlace(), true);
addEventListener('resize', () => AC.pop && acPlace());
if (window.visualViewport) visualViewport.addEventListener('resize', () => AC.pop && acPlace());
