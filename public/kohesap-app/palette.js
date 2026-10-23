'use strict';
/* ==========================================================================
   HIZLI ARAMA (Ctrl+K ya da "/")
   Tek kutudan: sayfalar, hızlı işlemler, event rehberleri, karakterler,
   fiyat listesindeki itemler. Ok tuşları + Enter, Esc kapatır.
   Türkçe harfler ve aksanlar yok sayılır ("gorev" → "Günlük Görevler").
   ========================================================================== */
const PAL = { open: false, q: '', idx: 0, list: [] };
const palKey = s => trLow(s).replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
ICON.search = I('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>');

/** aranabilir kayıtlar: { t, s (alt yazı), k (aranan metin), ic, run, g (grup) } */
function palItems() {
  const out = [], admin = typeof isAdmin === 'function' && isAdmin();
  PAGES.filter(p => p.id && (!p.admin || admin)).forEach(p => out.push({ g: 'Sayfa', t: p.t, s: p.d, ic: ICON[p.id], k: p.t + ' ' + p.id + ' ' + p.d, run: () => ACTIONS.go({ dataset: { id: p.id } }) }));
  const act = (t, s, ic, k, run) => out.push({ g: 'İşlem', t, s, ic, k: t + ' ' + k, run });
  act('Gelir ekle', 'Gelir / Gider defterine', ICON.plus, 'kazanç para noah', () => { ACTIONS.go({ dataset: { id: 'kasa' } }); ACTIONS['tx-add']({ dataset: { type: 'gelir' } }); });
  act('Gider ekle', 'Gelir / Gider defterine', ICON.plus, 'harcama masraf', () => { ACTIONS.go({ dataset: { id: 'kasa' } }); ACTIONS['tx-add']({ dataset: { type: 'gider' } }); });
  if (typeof grindOf === 'function') act('Grind başlat / bitir', 'Grind Takibi', ICON.grind, 'kasma exp', () => ACTIONS.go({ dataset: { id: 'grind' } }));
  if (typeof epForm === 'function' && typeof TEAM !== 'undefined' && TEAM.doc) act('Ekip planı aç', 'Ekibe etkinlik planla', ICON.planla, 'plan etkinlik rsvp', () => { ACTIONS.go({ dataset: { id: 'planla' } }); epForm(); });
  if (typeof hdForm === 'function') act('Hedef listesine item ekle', 'Hedef Listesi', ICON.hedef, 'set build hedef', () => { ACTIONS.go({ dataset: { id: 'hedef' } }); hdForm(null); });
  act('Karakter değiştir', 'Karakter seçimi', ICON.ekip || '', 'karakter char', () => ACTIONS['char-select']());
  if (typeof EVENT_GUIDES !== 'undefined') EVENT_GUIDES.forEach(g => out.push({ g: 'Rehber', t: g.n, s: `${g.tur} · ${g.lv} · ${g.sure}`, ic: ICON.rehber || '', k: g.n + ' ' + g.k + ' ' + g.pid + ' rehber', run: () => openGuide(g.pid) }));
  ((CUR.acc && CUR.acc.chars) || []).forEach(c => out.push({ g: 'Karakter', t: c.name, s: `Lv ${c.level}${c.server ? ' · ' + c.server : ''}${CUR.ch && CUR.ch.id === c.id ? ' · şu an' : ''}`, ic: typeof charAvatar === 'function' ? charAvatar(c, 22) : '', k: c.name + ' karakter', run: () => { if (!CUR.ch || CUR.ch.id !== c.id) enterChar(c); else render(); } }));
  (S.prices || []).forEach(p => out.push({ g: 'Fiyat', t: p.name, s: `${p.price ? fmtShort(p.price) : 'fiyat yok'}${p.cat ? ' · ' + p.cat : ''}`, ic: typeof itemIcon === 'function' && typeof itemIconPath === 'function' ? itemIcon(itemIconPath(p.name), p.name, 22) : '', k: p.name + ' ' + (p.cat || ''), run: () => { ui.priceQ = p.name; ACTIONS.go({ dataset: { id: 'fiyat' } }); } }));
  return out;
}
/** basit puanlama: başta eşleşme > kelime başı > içinde; tüm kelimeler geçmeli */
function palSearch(q) {
  const all = palItems();
  const words = palKey(q).split(' ').filter(Boolean);
  if (!words.length) return all.filter(x => x.g === 'Sayfa' || x.g === 'İşlem').slice(0, 12);
  const res = [];
  all.forEach(x => {
    const t = palKey(x.t), k = palKey(x.k);
    if (!words.every(w => k.includes(w))) return;
    let sc = 0;
    if (t.startsWith(words[0])) sc += 30; else if ((' ' + t).includes(' ' + words[0])) sc += 18; else if (t.includes(words[0])) sc += 10;
    sc += { 'Sayfa': 6, 'İşlem': 5, 'Rehber': 4, 'Karakter': 3, 'Fiyat': 1 }[x.g] || 0;
    res.push([sc, x]);
  });
  res.sort((a, b) => b[0] - a[0] || a[1].t.localeCompare(b[1].t, 'tr'));
  const list = res.slice(0, 30).map(r => r[1]);
  if (typeof hdForm === 'function' && q.trim().length >= 2) list.push({ g: 'İşlem', t: `"${q.trim()}" hedef listesine ekle`, s: 'Hedef Listesi', ic: ICON.hedef, run: () => { ACTIONS.go({ dataset: { id: 'hedef' } }); hdForm(null, q.trim()); } });
  return list;
}
function palPaint() {
  const box = $('#pal'); if (!box) return;
  PAL.list = palSearch(PAL.q); PAL.idx = clamp(PAL.idx, 0, Math.max(0, PAL.list.length - 1));
  let last = '';
  $('#palList').innerHTML = PAL.list.length ? PAL.list.map((x, i) => {
    const h = x.g !== last ? `<div class="pal-g">${esc(x.g)}</div>` : ''; last = x.g;
    return `${h}<button class="pal-it ${i === PAL.idx ? 'on' : ''}" data-pal="${i}" role="option" aria-selected="${i === PAL.idx}"><span class="pal-ic">${x.ic || ''}</span><span class="pal-tx"><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</span></button>`;
  }).join('') : '<div class="pal-none">Sonuç yok</div>';
  const on = $('#palList .pal-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function palOpen() {
  if (!CUR.ch || !$('#modalBack').hidden) return;
  let box = $('#pal');
  if (!box) {
    box = document.createElement('div'); box.id = 'pal'; box.className = 'pal-back';
    box.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Hızlı arama">
      <div class="pal-in">${ICON.search}<input id="palQ" type="text" placeholder="Sayfa, event, karakter, item ara…" autocomplete="off" spellcheck="false" aria-controls="palList"><kbd>Esc</kbd></div>
      <div class="pal-list" id="palList" role="listbox"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> aç</span><span><kbd>Ctrl</kbd><kbd>K</kbd> her yerden</span></div>
    </div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) palClose(); const b = e.target.closest('[data-pal]'); if (b) palRun(+b.dataset.pal); });
    $('#palQ').addEventListener('input', e => { PAL.q = e.target.value; PAL.idx = 0; palPaint(); });
  }
  PAL.open = true; PAL.q = ''; PAL.idx = 0; box.hidden = false;
  const inp = $('#palQ'); inp.value = ''; palPaint(); inp.focus();
}
function palClose() { const b = $('#pal'); if (b) b.hidden = true; PAL.open = false; }
function palRun(i) {
  const x = PAL.list[i]; if (!x) return;
  palClose(); document.body.classList.remove('nav-open');
  try { x.run(); } catch (e) { console.warn('hızlı arama', e); }
}
ACTIONS['pal-open'] = () => palOpen();
document.addEventListener('keydown', e => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); PAL.open ? palClose() : palOpen(); return; }
  if (!PAL.open) { if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); palOpen(); } return; }
  if (e.key === 'Escape') { e.preventDefault(); palClose(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); PAL.idx = clamp(PAL.idx + (e.key === 'ArrowDown' ? 1 : -1), 0, PAL.list.length - 1); palPaint(); }
  else if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.idx); }
}, true);
/* üst çubuğa arama düğmesi */
(function palButton() {
  const tr = document.querySelector('.top-right'); if (!tr || document.querySelector('.pal-btn')) return;
  const b = document.createElement('button');
  b.className = 'icon-btn pal-btn'; b.dataset.act = 'pal-open'; b.title = 'Hızlı arama (Ctrl+K)'; b.setAttribute('aria-label', 'Hızlı arama');
  b.innerHTML = ICON.search;
  tr.insertBefore(b, tr.firstChild);
})();
