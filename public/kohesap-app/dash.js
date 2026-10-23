'use strict';
/* ==========================================================================
   PANEL · "BUGÜN" ŞERİDİ
   Panelin üstünde dört kısa kart: günlük görevler, sıradaki ekip planı,
   sıradaki event ve grind. Her kart ilgili sayfayı açar.
   ========================================================================== */
function dashToday() {
  const now = Date.now(), cards = [];
  // günlük görevler
  const td = typeof todoOf === 'function' ? todoOf(CUR.ch) : null;
  if (td) {
    const s = todoStats(td, now), pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    const left = td.items.filter(x => !x.off && x.per === 'g' && !todoIsDone(td, x, now));
    cards.push(`<button class="card ds-card" data-act="go" data-id="gunluk">
      <span class="ds-ring" style="--p:${pct}"><b>${pct}%</b></span>
      <span class="ds-t"><small>Günlük görevler</small><b>${s.done}/${s.total} tamam</b><span class="mut">${left.length ? esc(left.slice(0, 2).map(x => x.t).join(', ')) + (left.length > 2 ? ` +${left.length - 2}` : '') : 'Bugünkü hepsi bitti ✓'}</span></span>
    </button>`);
  }
  // sıradaki ekip planı
  if (typeof TEAM !== 'undefined' && TEAM.doc && typeof EP !== 'undefined') {
    if (typeof epWatch === 'function') epWatch();
    const p = EP.list.filter(x => x.at > now - 3600e3).sort((a, b) => a.at - b.at)[0];
    const mine = p && (p.rsvp || {})[myUid()];
    const going = p ? Object.values(p.rsvp || {}).filter(r => r && r.s === 'y').length : 0;
    cards.push(`<button class="card ds-card" data-act="go" data-id="planla">
      <span class="ds-ic">${ICON.planla}</span>
      <span class="ds-t"><small>Ekip planı</small>${p ? `<b>${esc(p.t)}</b><span class="mut">${esc(epDayTime(p.at))} · ${going} geliyor · ${mine ? `sen: ${EP_RSVP[mine.s].s.toLocaleLowerCase('tr')}` : '<span class="gold">cevap ver</span>'}</span>` : `<b>Açık plan yok</b><span class="mut">Ekibinle bir event planla</span>`}</span>
    </button>`);
  }
  // sıradaki event
  if ((S.events || []).length) {
    const occ = occurrences(new Date(now), now + 2 * 864e5).filter(o => !/bakım/i.test(o.e.name));
    const live = occ.find(o => o.st.getTime() <= now && o.en.getTime() > now), nx = occ.find(o => o.st.getTime() > now);
    const o = live || nx;
    if (o) cards.push(`<button class="card ds-card" data-act="go" data-id="event">
      <span class="ds-ic" style="color:${o.e.color || 'var(--blue)'}">${ICON.event}</span>
      <span class="ds-t"><small>${live ? 'Şu an' : 'Sıradaki event'}</small><b>${esc(o.e.name)}</b><span class="mut">${live ? `bitişe <span data-cd="${o.en.getTime()}">${fmtCD(o.en - now)}</span>` : `${EP_DAY[o.st.getDay()]} ${o.t} · <span class="gold" data-cd="${o.st.getTime()}">${fmtCD(o.st - now)}</span>`}</span></span>
    </button>`);
  }
  // grind
  const g = typeof grindOf === 'function' ? grindOf() : null;
  if (g) {
    const last = g.list[g.list.length - 1];
    cards.push(`<button class="card ds-card ${g.live ? 'live' : ''}" data-act="go" data-id="grind">
      <span class="ds-ic">${ICON.grind}</span>
      <span class="ds-t"><small>Grind</small>${g.live ? `<b data-gr-clock>${grClock(grElapsed(g.live, now))}</b><span class="mut">${esc(g.live.place || 'kasılıyor')}${g.live.pauseAt ? ' · duraklatıldı' : ''}</span>`
        : last ? `<b>${last.exp && last.min ? fmtShort(last.exp / (last.min / 60)) + ' EXP/sa' : grFmtH(last.min * 60000)}</b><span class="mut">son: ${esc(last.place || '—')} · ${fmtDate(localDate(new Date(last.en)))}</span>`
        : '<b>Başlat</b><span class="mut">Kasılma süreni ve verimini ölç</span>'}</span>
    </button>`);
  }
  return cards.length ? `<div class="ds-row">${cards.join('')}</div>` : '';
}
const _panelD = VIEWS.panel;
VIEWS.panel = () => dashToday() + _panelD();
/* panelde canlı grind sayacı */
setInterval(() => {
  if (ui.page !== 'panel') return;
  const el = document.querySelector('.ds-card [data-gr-clock]'), g = typeof grindOf === 'function' && grindOf();
  if (el && g && g.live) el.textContent = grClock(grElapsed(g.live));
}, 1000);
