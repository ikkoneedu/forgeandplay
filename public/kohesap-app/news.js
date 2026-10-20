'use strict';
/* ==========================================================================
   KO Ekip — Yeni Sunucu: geri sayım, resmî takvim, bilinenler ve canlı haberler
   Haberler sunucuda toplanır (lib/ko-news.ts → kohesapAssets/news); bu sayfa
   belgeyi canlı izler. Yeni sunucuyla ilgili yeni haber gelince bildirim de gider
   (Bildirimler'de event bildirimleri açıksa).
   ========================================================================== */
const NS_STEPS = [
  { t: '1. ön kayıt (ödüllü)', a: '2026-10-15T16:00:00+03:00', b: '2026-10-29T16:00:00+03:00' },
  { t: '2. ön kayıt ve sunucu seçimi', a: '2026-10-29T16:00:00+03:00', b: '2026-11-12T16:00:00+03:00' },
  { t: 'Karakter oluşturma', a: '2026-11-10T00:00:00+03:00', b: '2026-11-12T00:00:00+03:00' },
  { t: 'Sunucular açılıyor', a: '2026-11-12T16:00:00+03:00', b: '' },
];
const NS_FACTS = [
  ['Ön kayıt zorunlu', 'Ön kaydı olmayan yeni sunuculara giremez; NTT Game hesabı tek başına yetmez.', 'resmî'],
  ['Telefon doğrulama ve OTP', 'Kayıt için telefon doğrulaması, giriş için OTP gerekir. 15 Ekim\'den beri yeni OTP kayıtları OTP+ uygulamasıyla yapılıyor.', 'resmî'],
  ['Ardream ve Ronark Land Base yok', 'Yeni sunucularda bu iki harita olmayacak; savaşlar Ronark Land\'de.', 'resmî'],
  ['Sunucu birleşmeleri', 'NTT Game ileride bazı sunucuların birleştirileceğini, ayrıntıların sonra duyurulacağını söylüyor.', 'resmî'],
  ['Seviye sınırı 70', 'Kopazar ve Oyuneks haberlerine göre yeni sunucular 70 level sınırıyla açılacak. Resmî sayfada henüz yazmıyor.', 'haber'],
  ['Sunucu adları', 'Henüz açıklanmadı. Açıklanınca haberlerde burada görünür.', 'bekleniyor'],
];
const NEWS = { doc: null, unsub: null, loading: false, err: '', last: 0, filter: 'yeni', timer: null };
ICON.yeni = I('<path d="M12 3l1.9 4.6L19 8.3l-3.8 3.4 1.1 5L12 14.2 7.7 16.7l1.1-5L5 8.3l5.1-.7z"/><path d="M5 21h14"/>');
PAGES.splice(Math.max(0, PAGES.findIndex(p => p.id === 'event') + 1), 0, { id: 'yeni', t: 'Yeni Sunucu', d: '12 Kasım açılışı: geri sayım, resmî takvim ve canlı haberler' });

function newsWatch() {
  if (NEWS.unsub || typeof CLOUD === 'undefined' || !CLOUD.db) return;
  try {
    NEWS.unsub = FB.onSnapshot(FB.doc(CLOUD.db, 'kohesapAssets', 'news'), s => {
      NEWS.doc = s.exists() ? s.data() : NEWS.doc; if (ui.page === 'yeni') newsPaint();
    }, () => { });
  } catch { }
}
async function newsLoad(force) {
  if (NEWS.loading || (!force && Date.now() - NEWS.last < 4 * 60e3)) return;
  NEWS.loading = true; NEWS.err = ''; NEWS.last = Date.now(); newsPaint();
  try {
    const base = typeof IS_EXE !== 'undefined' && IS_EXE ? siteBase() : '';
    const r = await (await authFetch(base + '/api/kohesap/news')).json();
    if (!r.ok) throw new Error(r.error || 'okunamadı');
    NEWS.doc = r;
  } catch (e) { NEWS.err = e.message; }
  NEWS.loading = false; newsPaint();
}
const nsMs = s => new Date(s).getTime();
function nsLeft(ms) {
  if (ms <= 0) return null;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return { d, h, m, s };
}
function nsHero() {
  const open = nsMs(NEW_SERVER.open), L = nsLeft(open - Date.now());
  const cell = (v, l) => `<div class="ns-c"><b data-nsc="${l}">${String(v).padStart(2, '0')}</b><span>${l}</span></div>`;
  return `<div class="card ns-hero">
    <div class="ns-hero-l">
      <span class="badge y">NTT Game · Türkiye</span>
      <h2>Yeni sunucular ${L ? 'açılıyor' : 'açıldı'}</h2>
      <p class="mut">12 Kasım 2026 Perşembe, saat 16:00 (Türkiye). Yeni başlangıç: herkes sıfırdan, ön kayıt şart.</p>
      <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
        <a class="btn pri sm" href="https://www.nttgame.com/knight/tr/newserveropen2026" target="_blank" rel="noopener">Resmî sayfa ↗</a>
        <button class="btn sm" data-act="go" data-id="bildirim">${ICON.bildirim || ''} Haber bildirimleri</button>
      </div>
    </div>
    <div class="ns-cd-wrap">${L ? `<div class="ns-cd">${cell(L.d, 'gün')}${cell(L.h, 'saat')}${cell(L.m, 'dk')}${cell(L.s, 'sn')}</div><div class="hint" style="text-align:center">açılışa kalan</div>` : '<div class="ns-open">Sunucular açık 🎉</div>'}</div>
  </div>`;
}
function nsTimeline() {
  const now = Date.now();
  return `<div class="card"><div class="card-h"><h3>Resmî takvim</h3><span class="sub">NTT Game duyurusu</span></div>
    <ol class="ns-tl">${NS_STEPS.map(st => {
      const a = nsMs(st.a), b = st.b ? nsMs(st.b) : a + 864e5;
      const state = now >= b ? 'done' : now >= a ? 'now' : 'next';
      const fmt = x => new Date(x).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      return `<li class="${state}"><i></i><div><b>${esc(st.t)}</b><span>${fmt(a)}${st.b ? ' – ' + fmt(b) : ' · 16:00'}</span></div><em>${state === 'done' ? 'bitti' : state === 'now' ? 'şu an' : 'yakında'}</em></li>`;
    }).join('')}</ol></div>`;
}
function nsFacts() {
  return `<div class="card"><div class="card-h"><h3>Bilinenler</h3></div>
    <div class="ns-facts">${NS_FACTS.map(([t, d, k]) => `<div class="ns-f"><div><b>${esc(t)}</b><span class="badge ${k === 'resmî' ? 'g' : k === 'haber' ? 'y' : ''}">${esc(k)}</span></div><p>${esc(d)}</p></div>`).join('')}</div></div>`;
}
function nsNews() {
  const d = NEWS.doc, items = (d && d.items) || [];
  const list = NEWS.filter === 'yeni' ? items.filter(x => x.yeni) : items;
  const src = d && d.src ? Object.entries(d.src) : [];
  return `<div class="card ns-news">
    <div class="card-h"><div><h3>Canlı haberler <span class="lp-live" style="margin-left:6px">canlı</span></h3><div class="sub">${d && d.at ? 'Son tarama ' + fmtAgo(d.at) + ' · her 10 dakikada bir' : NEWS.loading ? 'Kaynaklar taranıyor…' : 'Henüz tarama yok'}</div></div>
      <div class="row" style="gap:6px"><div class="seg"><button class="${NEWS.filter === 'yeni' ? 'on' : ''}" data-act="ns-f" data-v="yeni">Yeni sunucu</button><button class="${NEWS.filter === 'all' ? 'on' : ''}" data-act="ns-f" data-v="all">Tümü</button></div>
      <button class="btn sm ghost" data-act="ns-refresh" ${NEWS.loading ? 'disabled' : ''}>${NEWS.loading ? 'Taranıyor…' : 'Yenile'}</button></div></div>
    ${NEWS.err && !items.length ? `<div class="callout r" style="margin-bottom:10px">Haberler alınamadı: ${esc(NEWS.err)}</div>` : ''}
    <div class="ns-list">${list.slice(0, 40).map(x => `<a class="ns-it ${x.off ? 'off' : ''} ${Date.now() - (x.at || 0) < 864e5 ? 'fresh' : ''}" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">
      <div class="ns-it-h">${x.off ? '<span class="badge g">resmî</span>' : ''}${x.yeni && !x.off ? '<span class="badge y">yeni sunucu</span>' : ''}<span class="ns-src">${esc(x.src || '')}</span><span class="ns-time">${fmtAgo(x.pub || x.at)}</span></div>
      <b>${esc(x.t)}</b>${x.d ? `<p>${esc(x.d)}</p>` : ''}</a>`).join('') || `<div class="mut" style="padding:14px 4px">${NEWS.loading ? 'Kaynaklar taranıyor…' : 'Bu filtrede haber yok.'}</div>`}</div>
    ${src.length ? `<div class="ns-srcs">${src.map(([k, v]) => `<span class="${v.ok ? 'ok' : 'bad'}" title="${esc(v.err || '')}">${v.ok ? '●' : '○'} ${esc({ ntt: 'NTT Game', gnews: 'Google Haberler', kopazar: 'Kopazar', bynogame: 'ByNoGame', korehberi: 'KO Rehberi', oyuneks: 'Oyuneks' }[k] || k)}</span>`).join('')}</div>` : ''}
    <div class="hint" style="margin-top:10px">Haberler resmî sayfadan ve oyun sitelerinin bloglarından otomatik derlenir; doğruluğu kaynağa aittir. Resmî duyuru için NTT Game sayfasını esas al.</div>
  </div>`;
}
VIEWS.yeni = () => {
  newsWatch(); setTimeout(() => newsLoad(false), 0);
  if (!NEWS.timer) NEWS.timer = setInterval(() => { if (ui.page !== 'yeni') { clearInterval(NEWS.timer); NEWS.timer = null; return; } nsTick(); if (Date.now() - NEWS.last > 5 * 60e3) newsLoad(false); }, 1000);
  return `<div class="ns">${nsHero()}<div class="grid g-wide ns-grid"><div class="stack">${nsNews()}</div><div class="stack">${nsTimeline()}${nsFacts()}</div></div></div>`;
};
function newsPaint() { if (ui.page !== 'yeni') return; const el = document.querySelector('.ns-news'); if (el) el.outerHTML = nsNews(); }
function nsTick() {
  const L = nsLeft(nsMs(NEW_SERVER.open) - Date.now()); if (!L) return;
  const set = (k, v) => { const e = document.querySelector(`[data-nsc="${k}"]`); if (e) e.textContent = String(v).padStart(2, '0'); };
  set('gün', L.d); set('saat', L.h); set('dk', L.m); set('sn', L.s);
}
Object.assign(ACTIONS, {
  'ns-f': el => { NEWS.filter = el.dataset.v; newsPaint(); },
  'ns-refresh': () => newsLoad(true),
});
