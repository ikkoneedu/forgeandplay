'use strict';
/* ==========================================================================
   EVENT REHBERİ (sayfa) — veri guide-data.js'te
   Her event için seviye, giriş, kazanma koşulu, ödüller ve ipuçları; sıradaki
   seansa geri sayım, "Ekiple planla" ve event takvimine bağlantı.
   ========================================================================== */
const GD = { mine: false, open: '' };
/** "46–59 ve 60–83" → { min: 46, max: 83 } · sayı yoksa sınır yok */
function guideRange(g) {
  const n = (String(g.lv).match(/\d+/g) || []).map(Number);
  if (!n.length) return null;
  return { min: n[0], max: /–|-/.test(g.lv) ? n[n.length - 1] : 83 };
}
const guideFits = (g, lv) => { const r = guideRange(g); return !r || !lv || (lv >= r.min && lv <= r.max); };
/** takvimdeki karşılığı (renk ve sıradaki seans) */
const guideEvent = g => (S.events || []).find(e => !e.off && guideFor(e) === g) || null;
function guideNext(g, now) {
  const e = guideEvent(g); if (!e) return null;
  const o = occurrences(new Date(now), now + 8 * 864e5).find(x => x.e === e && x.en.getTime() > now);
  return o ? { st: o.st.getTime(), live: o.st.getTime() <= now, e } : null;
}

ICON.rehber = I('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'event') + 1, 0, { id: 'rehber', t: 'Event Rehberi', d: 'Seviye, giriş, kazanma koşulu, ödüller ve ipuçları · sıradaki seans' });

function guideCard(g, now, lv) {
  const nx = guideNext(g, now), color = (nx && nx.e.color) || '#5aa7ff', fits = guideFits(g, lv), open = GD.open === g.pid;
  const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
  return `<article class="card gd-card ${fits ? '' : 'dim'}" id="gd-${g.pid}" style="--ec:${color}">
    <div class="gd-top">
      <span class="gd-k">${esc(g.k)}</span>
      <div class="gd-t"><h3>${esc(g.n)}</h3><span class="mut">${esc(g.tur)}</span></div>
      <div class="gd-nx">${nx ? nx.live ? '<span class="badge g">şu an</span>' : `<small>${esc(EP_DAY[new Date(nx.st).getDay()])} ${clock(nx.st)}</small><b class="mono" data-cd="${nx.st}">${fmtCD(nx.st - now)}</b>` : '<small class="mut">takvimde yok</small>'}</div>
    </div>
    <div class="gd-chips"><span class="badge ${fits ? 'g' : ''}">Seviye: ${esc(g.lv)}</span><span class="badge">Süre: ${esc(g.sure)}</span>${lv && !fits ? '<span class="badge r">seviyen uymuyor</span>' : ''}</div>
    <p class="gd-oz">${esc(g.ozet)}</p>
    <details ${open ? 'open' : ''} data-gd="${g.pid}"><summary>Giriş, kazanma, ödüller ve ipuçları</summary>
      <dl class="gd-dl">
        <dt>Nasıl girilir</dt><dd>${esc(g.giris)}</dd>
        <dt>Nasıl kazanılır</dt><dd>${esc(g.kazan)}</dd>
        <dt>Ödüller</dt><dd><ul>${li(g.odul)}</ul></dd>
        <dt>İpuçları</dt><dd><ul>${li(g.ipucu)}</ul></dd>
        ${g.fark ? `<dt>Dikkat</dt><dd class="gd-fark">${esc(g.fark)}</dd>` : ''}
      </dl>
    </details>
    <div class="gd-acts">
      ${typeof TEAM !== 'undefined' && TEAM.doc ? `<button class="btn sm pri" data-act="gd-plan" data-id="${g.pid}">${ICON.planla || ''} Ekiple planla</button>` : ''}
      ${nx ? '<button class="btn sm ghost" data-act="go" data-id="event">Takvimde gör</button>' : ''}
    </div>
  </article>`;
}
VIEWS.rehber = () => {
  const now = Date.now(), lv = +(CUR.ch && CUR.ch.level) || 0;
  let list = EVENT_GUIDES.slice();
  if (GD.mine && lv) list = list.filter(g => guideFits(g, lv));
  // sıradaki seansa göre sırala; takvimde olmayanlar sona
  list.sort((a, b) => ((guideNext(a, now) || {}).st || Infinity) - ((guideNext(b, now) || {}).st || Infinity));
  if (GD.open) setTimeout(() => { const el = document.getElementById('gd-' + GD.open); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); GD.open = ''; }, 30);
  return `<div class="row gd-bar">
      ${lv ? `<label class="check"><input type="checkbox" data-gd-mine ${GD.mine ? 'checked' : ''}> Yalnızca seviyeme uygun (Lv ${lv})</label>` : ''}
      <span class="spacer"></span><span class="hint">Bilgiler ${esc(EVENT_GUIDES_AT)} itibarıyla topluluk rehberleri ve resmî duyurulardan; oyun içinden doğrula.</span>
    </div>
    <div class="gd-grid">${list.map(g => guideCard(g, now, lv)).join('') || `<div class="card">${empty('Seviyene uygun event yok', '')}</div>`}</div>`;
};
/** başka sayfalardan: rehberde ilgili kartı aç */
function openGuide(pid) { GD.open = pid; ui.page = 'rehber'; render(); }

Object.assign(ACTIONS, {
  'gd-plan': el => { if (typeof epForm === 'function') epForm(null, el.dataset.id); },
  'gd-open': el => openGuide(el.dataset.id),
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.gdMine != null) { GD.mine = e.target.checked; render(); }
});

/* event takvimi: listedeki her eventin yanında rehber bağlantısı */
const _evViewG = VIEWS.event;
VIEWS.event = () => {
  let html = _evViewG();
  (S.events || []).forEach(e => {
    const g = guideFor(e); if (!g) return;
    html = html.replace(`<b>${esc(e.name)}</b><div class="hint">`, `<b>${esc(e.name)}</b> <a href="#" class="gd-link" data-act="gd-open" data-id="${g.pid}">Rehber</a><div class="hint">`);
  });
  return html;
};
