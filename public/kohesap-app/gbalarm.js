'use strict';
/* ==========================================================================
   GB FİYAT GEÇMİŞİ VE ALARMI (GB Fiyatları sayfasının altında)
   Her GB yenilemesinde sunucu başına günün en ucuz satışı ve en yüksek alışı
   saklanır (son 60 gün, hesapla birlikte buluta):
     DB.shared.gbHist = { sunucu: [[ 'YYYY-AA-GG', enUcuzSatış, enYüksekAlış ], …] }
   Alarm (uygulama açıkken, GB yenilendiğinde denetlenir):
     DB.shared.gbAlarm = { on, srv, below, above }
       below: en ucuz satış bu TL'nin altına inerse (GB alma zamanı)
       above: en yüksek alış bu TL'nin üstüne çıkarsa (GB satma zamanı)
   ========================================================================== */
const GBA = { hit: {} };
const gbHist = () => (DB.shared.gbHist = DB.shared.gbHist || {});
const gbAlarm = () => Object.assign({ on: false, srv: '', below: 0, above: 0 }, DB.shared.gbAlarm || {});
function gbRecord(m) {
  if (!m || !Array.isArray(m.servers)) return;
  const h = gbHist(), day = localDate();
  m.servers.forEach(sv => {
    const s = gbStats(m, sv), sell = s.minSell ? s.minSell.v : 0, buy = s.maxBuy ? s.maxBuy.v : 0;
    if (!sell && !buy) return;
    const list = h[sv] || (h[sv] = []), last = list[list.length - 1];
    if (last && last[0] === day) { if (sell) last[1] = last[1] ? Math.min(last[1], sell) : sell; if (buy) last[2] = Math.max(last[2] || 0, buy); }
    else list.push([day, sell, buy]);
    if (list.length > 60) list.splice(0, list.length - 60);
  });
}
function gbCheckAlarm(m) {
  const a = gbAlarm(); if (!a.on || !m) return;
  const srv = a.srv || S.settings.server, s = gbStats(m, srv);
  const sell = s.minSell && s.minSell.v, buy = s.maxBuy && s.maxBuy.v;
  const say = (key, title, body) => {
    if (GBA.hit[key]) return; GBA.hit[key] = 1;
    if (typeof localNotify === 'function') localNotify(title, body, 'gb-' + key); else toast(title + ' · ' + body);
  };
  if (a.below && sell && sell <= a.below) say('b' + srv + a.below, '💰 GB ucuzladı', `${srv}: en ucuz satış ${fmtTL(sell)} (${s.minSell.site}) · alarmın ${fmtTL(a.below)}`);
  else if (a.below && sell > a.below) delete GBA.hit['b' + srv + a.below];
  if (a.above && buy && buy >= a.above) say('a' + srv + a.above, '💰 GB değerlendi', `${srv}: en yüksek alış ${fmtTL(buy)} (${s.maxBuy.site}) · alarmın ${fmtTL(a.above)}`);
  else if (a.above && buy < a.above) delete GBA.hit['a' + srv + a.above];
}
// her başarılı GB yenilemesinden sonra (refreshGB → applyGB)
const _applyGBA = applyGB;
applyGB = function () { const r = _applyGBA.apply(this, arguments); try { gbRecord(S.gbMarket); gbCheckAlarm(S.gbMarket); } catch (e) { console.warn('gb geçmişi', e); } return r; };

/** iki çizgili küçük grafik (satış yeşil, alış altın) */
function gbSpark(list) {
  const pts = list.slice(-30); if (pts.length < 2) return '';
  const vals = pts.flatMap(p => [p[1], p[2]]).filter(Boolean);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, W = 600, H = 120, P = 8;
  const xy = (i, v) => `${(P + i * (W - 2 * P) / (pts.length - 1)).toFixed(1)},${(H - P - (v - lo) / span * (H - 2 * P)).toFixed(1)}`;
  const line = k => pts.map((p, i) => p[k] ? xy(i, p[k]) : null).filter(Boolean).join(' ');
  return `<svg class="gba-sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Son ${pts.length} gün GB fiyatı">
    <polyline points="${line(1)}" fill="none" stroke="var(--green)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    <polyline points="${line(2)}" fill="none" stroke="var(--gold)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-dasharray="5 4"/>
  </svg><div class="gba-ax"><span>${esc(fmtDate(pts[0][0]))}</span><span>${fmtTL(lo)} – ${fmtTL(hi)}</span><span>${esc(fmtDate(pts[pts.length - 1][0]))}</span></div>`;
}
function gbHistCard() {
  const srv = S.settings.server, list = (gbHist()[srv] || []), a = gbAlarm();
  const last = list[list.length - 1], wk = list.find(p => p[0] >= localDate(new Date(Date.now() - 7 * 864e5)));
  const ch = (k) => last && wk && wk !== last && last[k] && wk[k] ? (last[k] - wk[k]) / wk[k] * 100 : null;
  const pct = v => v == null ? '<span class="mut">—</span>' : `<b>${v > 0 ? '▲' : v < 0 ? '▼' : ''} %${nf2.format(Math.abs(v))}</b>`;
  return `<div class="grid g-wide gba">
    <div class="card"><div class="card-h"><h3>${esc(srv)} · fiyat geçmişi</h3><span class="sub">${list.length} gün kayıt</span></div>
      ${list.length >= 2 ? gbSpark(list) + `<div class="gba-lg"><span><i class="s"></i>En ucuz satış ${last && last[1] ? fmtTL(last[1]) : '—'} · 7 gün ${pct(ch(1))}</span><span><i class="b"></i>En yüksek alış ${last && last[2] ? fmtTL(last[2]) : '—'} · 7 gün ${pct(ch(2))}</span></div>`
        : `<div class="mut" style="padding:8px 0">Geçmiş, GB fiyatları her yenilendiğinde günlük olarak birikir. Birkaç gün sonra grafik burada görünür.</div>`}
    </div>
    <div class="card"><div class="card-h"><h3>Fiyat alarmı</h3><label class="check"><input type="checkbox" data-gba-on ${a.on ? 'checked' : ''}> Açık</label></div>
      <div class="form">
        <label class="f">Sunucu<select class="inp" data-gba="srv">${(S.gbMarket ? S.gbMarket.servers : [srv]).map(s => `<option ${s === (a.srv || srv) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="f">Satış bu TL'nin altına inerse<input class="inp num" data-gba="below" value="${a.below || ''}" placeholder="örn. 300"><span class="hint">GB alma zamanı</span></label>
        <label class="f">Alış bu TL'nin üstüne çıkarsa<input class="inp num" data-gba="above" value="${a.above || ''}" placeholder="örn. 360"><span class="hint">GB satma zamanı</span></label>
      </div>
      <div class="hint" style="margin-top:8px">Uygulama açıkken GB fiyatı her yenilendiğinde denetlenir; eşik geçilince bildirim gelir (bir kez, fiyat geri dönünce yeniden kurulur).</div>
    </div>
  </div>`;
}
const _gbViewA = VIEWS.gb;
VIEWS.gb = function () { const html = _gbViewA.apply(this, arguments); return S.gbMarket ? html + gbHistCard() : html; };
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.gbaOn != null) { DB.shared.gbAlarm = { ...gbAlarm(), on: e.target.checked }; save(); if (e.target.checked) gbCheckAlarm(S.gbMarket); render(); }
  if (d.gba != null) {
    const v = d.gba === 'srv' ? e.target.value : Math.max(0, parseNum(e.target.value) || 0);
    DB.shared.gbAlarm = { ...gbAlarm(), [d.gba]: v }; GBA.hit = {}; save();
  }
});
