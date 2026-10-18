'use strict';
/* ==========================================================================
   KO Ekip — arayüz v2 yardımcıları
   • Telefon / tablet: alt sekme çubuğu (Ekip, Ses, Boss, Panel, Menü)
   • Telefonda tablolar kart listesine dönüşür (başlıklar etiket olur)
   • Sayfa değişiminde yumuşak geçiş
   ========================================================================== */
const TABS = [
  { id: 'ekip', t: 'Ekip' },
  { id: 'ses', t: 'Sohbet' },
  { id: 'boss', t: 'Boss' },
  { id: 'panel', t: 'Defter' },
];
ICON.more = I('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>');
const tabbar = document.createElement('nav');
tabbar.className = 'tabbar'; tabbar.id = 'tabbar'; tabbar.setAttribute('aria-label', 'Ana menü');
document.body.appendChild(tabbar);
function renderTabbar() {
  const logged = typeof CUR !== 'undefined' && !!CUR.ch && (() => { const a = document.getElementById('auth'); return !a || a.hidden; })();
  if (tabbar.hidden !== !logged) tabbar.hidden = !logged;
  if (!logged) return;
  const has = id => PAGES.some(p => p.id === id);
  const tabs = TABS.filter(t => has(t.id));
  const inTabs = tabs.some(t => t.id === ui.page);
  const unread = typeof CHAT !== 'undefined' ? CHAT.unread : 0;
  tabbar.innerHTML = tabs.map(t => `<button class="tab ${ui.page === t.id ? 'on' : ''}" data-act="go" data-id="${t.id}" aria-label="${esc(t.t)}">${ICON[t.id] || ''}<span>${esc(t.t)}</span>${t.id === 'ses' && unread ? `<i>${unread > 99 ? '99+' : unread}</i>` : ''}</button>`).join('')
    + `<button class="tab ${inTabs ? '' : 'on'}" data-act="nav-toggle" aria-label="Tüm sayfalar">${ICON.more}<span>${inTabs ? 'Menü' : esc((PAGES.find(p => p.id === ui.page) || {}).t || 'Menü')}</span></button>`;
}

/* ---------- tablo → kart (yalnız telefonda görünür etkisi var) ---------- */
const CARD_SKIP = '.il-tbl,.xp-tbl,.no-card,.week-grid table';
function cardifyTables(root) {
  root.querySelectorAll('.tbl-wrap > table').forEach(tb => {
    if (tb.matches(CARD_SKIP) || tb.closest('.no-card')) return;
    const heads = [...tb.querySelectorAll('thead th')].map(th => th.innerText.replace(/[▲▼]/g, '').trim());
    if (heads.length < 3) return;
    tb.classList.add('cardify'); tb.parentElement.classList.add('cardify');
    tb.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
      let col = 0;
      const cells = [...tr.children];
      cells.forEach((td, i) => {
        const span = +td.getAttribute('colspan') || 1;
        const label = heads[col] || '';
        col += span;
        const hasCtl = td.querySelector('button, a.btn, .acts');
        const txt = td.innerText.trim();
        const hasInput = td.querySelector('input, select, textarea');
        if (i === 0) { td.classList.add('c-main'); return; }
        if (i === cells.length - 1 && hasCtl && !hasInput && txt.length < 12) { td.classList.add('c-acts'); return; }
        if (!txt && !hasInput && !td.querySelector('img,svg,.badge')) { td.classList.add('c-empty'); return; }
        if (span > 1 && cells.length <= 2) { td.classList.add('c-main'); return; }
        if (label) {
          td.setAttribute('data-l', label);
          if (td.childNodes.length && !(td.children.length === 1 && td.firstElementChild.classList.contains('c-v'))) {
            const w = document.createElement('span'); w.className = 'c-v';
            while (td.firstChild) w.appendChild(td.firstChild);
            td.appendChild(w);
          }
        }
      });
    });
  });
}

/* ---------- render kancası ---------- */
let _lastPg = null;
const _renderV1 = render;
render = function () {
  _renderV1();
  const c = document.getElementById('content');
  if (c) {
    cardifyTables(c);
    if (_lastPg !== ui.page) { c.classList.remove('pg-enter'); void c.offsetWidth; c.classList.add('pg-enter'); _lastPg = ui.page; setTimeout(() => c.classList.remove('pg-enter'), 300); }
  }
  renderTabbar();
};
const _renderNavV2 = renderNav;
renderNav = function () { _renderNavV2(); renderTabbar(); };
if (typeof chatBadge === 'function') { const _cb = chatBadge; chatBadge = function () { _cb(); renderTabbar(); }; }
// sayfaya gidince çekmece kapansın, sayfa başına dönülsün
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-act="go"]');
  if (b && document.body.classList.contains('nav-open')) document.body.classList.remove('nav-open');
}, true);
// giriş ekranı açılıp kapanınca sekme çubuğu güncellensin
new MutationObserver(() => renderTabbar()).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
