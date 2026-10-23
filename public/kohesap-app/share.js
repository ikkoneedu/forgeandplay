'use strict';
/* ==========================================================================
   PAYLAŞIM KARTLARI
   Plan daveti, ekip kartı ve grind sonucu için 1200×630 görsel (tarayıcıda canvas).
   Telefonda paylaşım menüsü (WhatsApp, Discord…) açılır; açılmazsa PNG iner.
   Sunucuya hiçbir şey gönderilmez.
   ========================================================================== */
/* eski tarayıcılar için roundRect */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
const SH_W = 1200, SH_H = 630, SH_FONT = "'Inter Variable', 'Segoe UI', system-ui, sans-serif";
function shCanvas() {
  const c = document.createElement('canvas'); c.width = SH_W; c.height = SH_H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, SH_W, SH_H); g.addColorStop(0, '#0b0d11'); g.addColorStop(1, '#151820');
  x.fillStyle = g; x.fillRect(0, 0, SH_W, SH_H);
  const r = x.createRadialGradient(140, 80, 10, 140, 80, 520); r.addColorStop(0, 'rgba(227,181,84,.22)'); r.addColorStop(1, 'rgba(227,181,84,0)');
  x.fillStyle = r; x.fillRect(0, 0, SH_W, SH_H);
  x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 2; x.strokeRect(1, 1, SH_W - 2, SH_H - 2);
  // üst bilgi ve alt bilgi
  x.fillStyle = '#e3b554'; x.font = `700 30px ${SH_FONT}`; x.fillText('KO Ekip', 64, 76);
  x.fillStyle = 'rgba(255,255,255,.45)'; x.font = `500 22px ${SH_FONT}`; x.fillText('Knight Online ekip uygulaması', 64, 108);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.font = `600 22px ${SH_FONT}`; x.textAlign = 'right'; x.fillText('forgeandplay.com', SH_W - 64, SH_H - 44); x.textAlign = 'left';
  return { c, x };
}
/** metni genişliğe sığdır (gerekirse … ile kes) */
function shFit(x, t, w) { t = String(t || ''); if (x.measureText(t).width <= w) return t; while (t && x.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
function shPill(x, t, px, py, color) {
  x.font = `600 22px ${SH_FONT}`; const w = x.measureText(t).width + 32;
  x.fillStyle = color + '26'; x.beginPath(); x.roundRect(px, py, w, 40, 20); x.fill();
  x.fillStyle = color; x.fillText(t, px + 16, py + 28); return w;
}
async function shShare(c, name, text) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) return toast('Görsel oluşturulamadı', 'err');
  const file = new File([blob], name + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { });
  toast('Görsel indirildi' + (text ? ' · metin panoya kopyalandı' : ''), 'ok');
}
const shSlug = t => String(t || '').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-+|-+$/g, '') || 'kart';
const shCls = k => (CLASSES[k] || {}).color || '#8a93a3';

/* ---------- plan daveti ---------- */
async function sharePlan(p) {
  const { c, x } = shCanvas();
  const rows = epRows(p), going = rows.filter(r => r.r && r.r.s === 'y'), maybe = rows.filter(r => r.r && r.r.s === 'm');
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `600 26px ${SH_FONT}`; x.fillText(shFit(x, (TEAM.doc && TEAM.doc.name) || 'Ekip', 700) + ' · plan', 64, 196);
  x.fillStyle = '#fff'; x.font = `700 64px ${SH_FONT}`; x.fillText(shFit(x, p.t, SH_W - 128), 64, 272);
  x.fillStyle = '#e3b554'; x.font = `700 40px ${SH_FONT}`; x.fillText(epDayTime(p.at), 64, 330);
  let px = 64; px += shPill(x, `${going.length} geliyor`, px, 360, '#3fcf8e') + 10; if (maybe.length) shPill(x, `${maybe.length} belki`, px, 360, '#e3b554');
  x.font = `600 26px ${SH_FONT}`;
  going.slice(0, 8).forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2), cx = 64 + col * 520, cy = 446 + row * 36;
    x.fillStyle = shCls(r.r.cls); x.beginPath(); x.arc(cx + 8, cy - 9, 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText(shFit(x, (r.r.cn || teamMainName(r.m)) + (r.r.lv ? ' · Lv ' + r.r.lv : ''), 470), cx + 26, cy);
  });
  if (p.note) { x.fillStyle = 'rgba(255,255,255,.5)'; x.font = `500 22px ${SH_FONT}`; x.fillText(shFit(x, p.note, SH_W - 420), 64, SH_H - 44); }
  await shShare(c, 'plan-' + shSlug(p.t), `📅 ${p.t} · ${epDayTime(p.at)} · ${going.length} geliyor${p.note ? '\n' + p.note : ''}\nKO Ekip · forgeandplay.com`);
}

/* ---------- ekip kartı ---------- */
async function shareTeam() {
  const ms = teamMembers(); if (!ms.length) return;
  const { c, x } = shCanvas();
  const mains = ms.map(m => m.mainChar).filter(Boolean);
  const avg = mains.length ? sum(mains, m => m.level) / mains.length : 0;
  x.fillStyle = '#fff'; x.font = `700 60px ${SH_FONT}`; x.fillText(shFit(x, TEAM.doc.name || 'Ekip', SH_W - 128), 64, 200);
  let px = 64; px += shPill(x, `${ms.length}/${TEAM_MAX} üye`, px, 226, '#5aa7ff') + 10;
  if (avg) px += shPill(x, `ortalama Lv ${fmtX(Math.round(avg * 10) / 10)}`, px, 226, '#e3b554') + 10;
  const srv = [...new Set(mains.map(m => m.server).filter(Boolean))]; if (srv.length === 1) shPill(x, srv[0], px, 226, '#a58bff');
  ms.slice(0, 8).forEach((m, i) => {
    const mc = m.mainChar || {}, col = i % 2, row = Math.floor(i / 2), cx = 64 + col * 540, cy = 330 + row * 62;
    x.fillStyle = shCls(mc.cls); x.beginPath(); x.roundRect(cx, cy - 34, 8, 44, 4); x.fill();
    x.fillStyle = '#fff'; x.font = `700 28px ${SH_FONT}`; x.fillText(shFit(x, mc.name || m.name, 300), cx + 22, cy - 6);
    x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `500 20px ${SH_FONT}`;
    x.fillText(shFit(x, mc.level ? `Lv ${mc.level} · ${jobTitle(mc)}` : '', 470), cx + 22, cy + 18);
  });
  await shShare(c, 'ekip-' + shSlug(TEAM.doc.name), `🛡️ ${TEAM.doc.name} · ${ms.length}/${TEAM_MAX} üye${avg ? ' · ort. Lv ' + fmtX(Math.round(avg * 10) / 10) : ''}\nKO Ekip · forgeandplay.com`);
}

/* ---------- grind sonucu ---------- */
async function shareGrind(rec) {
  const { c, x } = shCanvas(), h = rec.min / 60, net = (rec.noah || 0) - (rec.cost || 0);
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `600 26px ${SH_FONT}`; x.fillText(`${CUR.ch.name} · grind`, 64, 196);
  x.fillStyle = '#fff'; x.font = `700 64px ${SH_FONT}`; x.fillText(shFit(x, rec.place || 'Grind', SH_W - 128), 64, 272);
  const box = (lbl, val, bx, col) => {
    x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(bx, 330, 330, 150, 18); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = `600 22px ${SH_FONT}`; x.fillText(lbl, bx + 26, 374);
    x.fillStyle = col; x.font = `700 48px ${SH_FONT}`; x.fillText(shFit(x, val, 290), bx + 26, 440);
  };
  box('Süre', grFmtH(rec.min * 60000), 64, '#fff');
  box('Saatte EXP', rec.exp && h ? fmtShort(rec.exp / h) : '—', 420, '#e3b554');
  box('Net noah', net ? (net > 0 ? '+' : '') + fmtShort(net) : '—', 776, net >= 0 ? '#3fcf8e' : '#f26b6b');
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `500 24px ${SH_FONT}`;
  x.fillText(shFit(x, `Lv ${rec.lv} %${fmtX(rec.a)} → ${rec.lv2 !== rec.lv ? 'Lv ' + rec.lv2 + ' ' : ''}%${fmtX(rec.b)}${rec.items ? ' · ' + rec.items : ''}`, SH_W - 420), 64, 530);
  await shShare(c, 'grind', `⏱️ ${rec.place || 'Grind'} · ${grFmtH(rec.min * 60000)}${rec.exp && h ? ' · ' + fmtShort(rec.exp / h) + ' EXP/sa' : ''}${net ? ' · ' + fmtShort(net) + ' net' : ''}\nKO Ekip · forgeandplay.com`);
}

/* ---------- düğmeler ---------- */
ICON.share = I('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>');
Object.assign(ACTIONS, {
  'sh-plan': el => { const p = EP.list.find(x => x.id === el.dataset.id); if (p) sharePlan(p).catch(e => toast(e.message, 'err')); },
  'sh-team': () => shareTeam().catch(e => toast(e.message, 'err')),
  'sh-grind': el => { const r = grindOf().list.find(x => x.id === el.dataset.id); if (r) shareGrind(r).catch(e => toast(e.message, 'err')); },
});
// ekip sayfası: "Ekiple parti aç"ın yanına
const _ekipSh = VIEWS.ekip;
VIEWS.ekip = function () {
  const html = _ekipSh.apply(this, arguments);
  return TEAM.doc ? html.replace(`<button class="btn pri" data-act="party-from-team">`, `<button class="btn" data-act="sh-team">${ICON.share} Ekip kartı</button><button class="btn pri" data-act="party-from-team">`) : html;
};
