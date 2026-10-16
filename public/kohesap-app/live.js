'use strict';
/* ==========================================================================
   CANLI VERİ: GB fiyatları, canlı pazar, event takvimi, PUS hesaplayıcı
   Sayfalar programın içinden (yerel sunucu üzerinden) indirilir ve
   tarayıcının HTML ayrıştırıcısıyla okunur.
   ========================================================================== */

const trLow = s => String(s || '').toLocaleLowerCase('tr');
// sunucu adları Latin harfli: Türkçe I/ı dönüşümü uygulanmaz (FELIS → Felis)
const titleCase = s => String(s || '').toLowerCase().replace(/ı/g, 'i').replace(/(^|\s)\S/g, c => c.toUpperCase());
const foldSrv = v => String(v || '').toLowerCase().replace(/ı/g, 'i').replace(/[\s_-]*\d+$/, '').trim();

function cellText(c) {
  const parts = []; const w = (c.ownerDocument || document).createTreeWalker(c, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const v = w.currentNode.textContent.replace(/\s+/g, ' ').trim(); if (v) parts.push(v); }
  let t = parts.join(' ');
  if (!t) {
    const img = c.querySelector('img[alt],img[title]');
    if (img) t = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
  }
  if (!t) {
    const a = c.querySelector('a[href^="http"]');
    if (a) try { t = new URL(a.href).hostname.replace(/^www\./, ''); } catch { }
  }
  return t;
}
// <table> → colspan/rowspan açılmış 2 boyutlu metin tablosu
function tableGrid(table) {
  const grid = [];
  [...table.rows].forEach((tr, ri) => {
    grid[ri] = grid[ri] || [];
    let ci = 0;
    for (const cell of tr.cells) {
      while (grid[ri][ci] !== undefined) ci++;
      const cs = Math.max(1, +cell.colSpan || 1), rs = Math.max(1, +cell.rowSpan || 1);
      const t = cellText(cell);
      for (let r = 0; r < rs; r++) { grid[ri + r] = grid[ri + r] || []; for (let c = 0; c < cs; c++) grid[ri + r][ci + c] = t; }
      ci += cs;
    }
  });
  return grid.map(r => Array.from(r, x => x ?? ''));
}
const parseDoc = html => new DOMParser().parseFromString(html, 'text/html');
const isNumCell = s => /^[₺$]?\s*\d[\d.,]*\s*(tl|₺)?$/i.test(String(s).trim());

/* ---------- akıllı indirme: önce doğrudan, olmazsa gizli tarayıcı ---------- */
async function rawFetch(url, render) {
  if (!serverMode) {
    // web: sitenin sunucusu üzerinden (izinli adresler, 5 dk önbellek)
    const r = await fetch('/api/kohesap/proxy?url=' + encodeURIComponent(url));
    if (!r.ok && r.status !== 502) throw new Error('sunucu hatası ' + r.status);
    const d = await r.json();
    if (d.html && !d.text) d.text = (parseDoc(d.html).body || {}).textContent || '';
    return d;
  }
  const r = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, render, wait: render ? 9000 : 0 }) });
  if (!r.ok) throw new Error('program sunucusu hatası');
  return r.json();
}
// parse(html, d) veri bulursa sonucu döner, bulamazsa null.
async function smartFetch(urls, parse, onStatus) {
  const errs = [];
  const modes = S.settings.fetchModes || (S.settings.fetchModes = {});
  for (const url of urls.filter(Boolean)) {
    let host; try { host = new URL(url).host; } catch { errs.push('geçersiz adres: ' + url); continue; }
    const order = modes[host] === 'tarayici' ? [true, false] : [false, true];
    for (const render of order) {
      const lbl = render ? 'gizli tarayıcı' : 'doğrudan';
      if (onStatus) onStatus(render ? host + ' gizli tarayıcıyla açılıyor…' : host + ' indiriliyor…');
      try {
        const d = await rawFetch(url, render);
        if (d.html) {
          const res = parse(d.html, d);
          if (res) {
            const m = render ? 'tarayici' : 'dogrudan';
            if (modes[host] !== m) { modes[host] = m; save(); }
            return { res, url, mode: m, d };
          }
          errs.push(`${host} (${lbl}): ${d.ok ? 'sayfada veri bulunamadı' : (d.error || 'hata')}`);
        } else errs.push(`${host} (${lbl}): ${d.error || 'boş cevap'}`);
      } catch (e) { errs.push(`${host} (${lbl}): ${e.message}`); }
    }
  }
  throw new Error(errs.join(' · ') || 'adres yok');
}
// Web kaynakları / test için: herhangi bir dolu sayfa yeterli
fetchPage = async url => (await smartFetch([url], (h, d) => d.ok && d.text ? d : null)).res;
const withTest = u => [u, u.replace('://www.', '://test.')].filter((x, i, a) => x && a.indexOf(x) === i);

/* ---------- kart tipi ilan listeleri (tablo olmayan siteler) ---------- */
function leafTexts(el) {
  const out = [];
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t); }
      else if (c.nodeType === 1 && !/^(SCRIPT|STYLE|SVG|NOSCRIPT)$/i.test(c.tagName)) {
        if (c.tagName === 'IMG' && c.alt) out.push(c.alt.trim());
        else walk(c);
      }
    }
  };
  walk(el);
  return out.filter((t, i) => t !== out[i - 1]).slice(0, 14);
}
function parseCards(doc) {
  let best = null;
  if (!doc.body) return null;
  doc.body.querySelectorAll('*').forEach(el => {
    const kids = [...el.children];
    if (kids.length < 3) return;
    const key = k => k.tagName + '.' + (typeof k.className === 'string' ? k.className.trim().split(/\s+/).sort().join('.') : '');
    const counts = {};
    kids.forEach(k => { const x = key(k); counts[x] = (counts[x] || 0) + 1; });
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n < 3) return;
    const items = kids.filter(k => key(k) === top && /\d/.test(k.textContent));
    if (items.length < 3) return;
    const cols = leafTexts(items[0]).length;
    if (cols < 2) return;
    const score = items.length * Math.min(cols, 8);
    if (!best || score > best.score) best = { score, items };
  });
  if (!best) return null;
  const rows = best.items.map(leafTexts);
  const w = Math.max(...rows.map(r => r.length));
  return { head: Array.from({ length: w }, (_, i) => 'Alan ' + (i + 1)), rows: rows.map(r => Array.from({ length: w }, (_, i) => r[i] || '')), cards: true };
}

/* ---------- GB tablosu ayrıştırma ---------- */
function parseGBTable(html) {
  const doc = parseDoc(html);
  for (const table of doc.querySelectorAll('table')) {
    const g = tableGrid(table);
    const hi = g.findIndex(r => r.some(c => /sat[ıi][şs]/.test(trLow(c))) && r.some(c => /al[ıi][şs]/.test(trLow(c))));
    if (hi < 0) continue;
    const cols = [];
    g[hi].forEach((c, ci) => {
      const n = trLow(c);
      const kind = /sat[ıi][şs]/.test(n) ? 'sell' : /al[ıi][şs]/.test(n) ? 'buy' : null;
      if (!kind) return;
      let server = c.replace(/sat[ıi][şs]|al[ıi][şs]/gi, '').trim();
      if (!server && hi > 0) server = g[hi - 1][ci] || '';
      server = titleCase(server.replace(/[^\p{L}\p{N} ]/gu, '').trim()) || 'Sunucu ' + (cols.length + 1);
      cols.push({ ci, kind, server });
    });
    if (!cols.length) continue;
    const servers = [...new Set(cols.map(c => c.server))];
    const rows = [];
    for (let r = hi + 1; r < g.length; r++) {
      const row = g[r];
      const site = row.find((c, i) => !cols.some(x => x.ci === i) && c && !isNumCell(c) && c !== '#');
      if (!site) continue;
      const prices = {};
      cols.forEach(c => { const v = parseNum(String(row[c.ci] || '').replace(/[^\d.,]/g, '')); (prices[c.server] = prices[c.server] || {})[c.kind] = v || 0; });
      if (Object.values(prices).some(p => p.sell || p.buy)) rows.push({ site, prices });
    }
    if (!rows.length) continue;
    const txt = doc.body ? doc.body.textContent : '';
    const up = txt.match(/Son\s*G[üu]ncel\w*\s*:?\s*([\d./]+\s*[\d:]*)/i);
    return { servers, rows, updated: up ? up[1].trim() : '' };
  }
  return null;
}
function gbStats(m, server) {
  const sells = m.rows.map(r => ({ site: r.site, v: (r.prices[server] || {}).sell || 0 })).filter(x => x.v > 0);
  const buys = m.rows.map(r => ({ site: r.site, v: (r.prices[server] || {}).buy || 0 })).filter(x => x.v > 0);
  const minSell = sells.reduce((a, b) => !a || b.v < a.v ? b : a, null);
  const maxBuy = buys.reduce((a, b) => !a || b.v > a.v ? b : a, null);
  const avgSell = sells.length ? sum(sells, x => x.v) / sells.length : 0;
  const avgBuy = buys.length ? sum(buys, x => x.v) / buys.length : 0;
  return { minSell, maxBuy, avgSell, avgBuy, n: sells.length };
}
function applyGB() {
  const m = S.gbMarket; if (!m) return;
  if (!m.servers.includes(S.settings.server)) {
    const hit = m.servers.find(s => foldSrv(s) === foldSrv(S.settings.server));
    S.settings.server = hit || m.servers[0];
  }
  const st = gbStats(m, S.settings.server);
  const v = { minSell: st.minSell && st.minSell.v, avgSell: st.avgSell, maxBuy: st.maxBuy && st.maxBuy.v, avgBuy: st.avgBuy }[S.settings.gbPick] || 0;
  if (v) { S.settings.gbTL = v; S.settings.gbTime = new Date().toLocaleString('tr-TR') + ' · ' + S.settings.server; }
}
let gbBusy = false;
async function refreshGB(quiet) {
  if (gbBusy) return; gbBusy = true;
  ui.gbStatus = 'GB fiyatları çekiliyor…'; if (ui.page === 'gb') render();
  try {
    const urls = [S.settings.gbUrl, S.settings.gbUrl2, ...withTest(S.settings.gbUrl)].filter((x, i, a) => x && a.indexOf(x) === i);
    const r = await smartFetch(urls, html => parseGBTable(html), t => { ui.gbStatus = t; const el = document.querySelector('[data-gbstatus]'); if (el) el.textContent = t; });
    S.gbMarket = { ...r.res, time: new Date().toLocaleString('tr-TR'), url: r.url, mode: r.mode, ts: Date.now() };
    ui.gbErr = ''; applyGB(); save();
    if (!quiet) toast('GB fiyatları güncellendi', 'ok');
    return true;
  } catch (e) {
    ui.gbErr = e.message;
    if (!quiet) toast('GB fiyatı alınamadı', 'err');
    return false;
  } finally { gbBusy = false; ui.gbStatus = ''; render(); }
}

VIEWS.gb = () => {
  const m = S.gbMarket, st = S.settings;
  const picks = [['minSell', 'En ucuz satış'], ['avgSell', 'Ortalama satış'], ['maxBuy', 'En yüksek alış'], ['avgBuy', 'Ortalama alış']];
  const head = `<div class="row" style="margin-bottom:16px">
      ${m ? `<div class="seg" style="flex-wrap:wrap">${m.servers.map(s => `<button class="${s === st.server ? 'on' : ''}" data-act="gb-server" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      <div class="spacer"></div>
      <label class="f" style="flex-direction:row;align-items:center;gap:8px">1 GB fiyatı olarak
        <select class="inp" style="width:auto" data-gbpick="1">${picks.map(([k, l]) => `<option value="${k}" ${st.gbPick === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn pri" data-act="gb-refresh">${ICON.refresh} Yenile</button>
    </div>`;
  if (!m) return head + `<div class="card">${gbBusy ? empty('Çekiliyor…', `<span data-gbstatus>${esc(ui.gbStatus || '')}</span><br>Gerekirse gizli tarayıcı açılır, bu 10–15 sn sürebilir.`) : ui.gbErr ? errBox('GB fiyatları alınamadı', ui.gbErr, S.settings.gbUrl) : empty('Henüz veri çekilmedi', '“Yenile” ile sitelerin güncel GB fiyatlarını çekin.')}</div>`;
  const s = gbStats(m, st.server);
  const best = {};
  m.servers.forEach(sv => { const x = gbStats(m, sv); best[sv] = { s: x.minSell && x.minSell.v, b: x.maxBuy && x.maxBuy.v }; });
  return head + `
  <div class="grid g4" style="margin-bottom:16px">
    ${stat(st.server + ' · en ucuz satış', s.minSell ? fmtTL(s.minSell.v) : '—', s.minSell ? esc(s.minSell.site) : '', 'var(--green)')}
    ${stat(st.server + ' · en yüksek alış', s.maxBuy ? fmtTL(s.maxBuy.v) : '—', s.maxBuy ? esc(s.maxBuy.site) + ' (GB satarsan)' : '', 'var(--blue)')}
    ${stat('Ortalama satış / alış', fmtTL(s.avgSell), 'alış ort. ' + fmtTL(s.avgBuy) + ' · ' + s.n + ' site', 'var(--violet)')}
    ${stat('Programda 1 GB =', `<span class="gold">${fmtTL(st.gbTL)}</span>`, st.usdTL ? '$' + nf2.format(st.gbTL / st.usdTL) + ' · tüm hesaplar bunu kullanır' : 'tüm hesaplar bunu kullanır', 'var(--gold)')}
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="tbl-wrap" style="border:0;border-radius:0"><table class="gbt">
      <thead>
        <tr><th rowspan="2">Site</th>${m.servers.map(sv => `<th colspan="2" style="text-align:center;${sv === st.server ? 'color:var(--gold2);background:#1d1a12' : ''}">${esc(sv)}</th>`).join('')}</tr>
        <tr>${m.servers.map(sv => `<th class="num" style="${sv === st.server ? 'background:#1d1a12' : ''}">Satış</th><th class="num" style="${sv === st.server ? 'background:#1d1a12' : ''}">Alış</th>`).join('')}</tr>
      </thead>
      <tbody>${m.rows.map(r => `<tr><td><b>${esc(r.site)}</b></td>${m.servers.map(sv => { const p = r.prices[sv] || {}; const bg = sv === st.server ? 'background:rgba(227,181,84,.05)' : ''; return `
        <td class="num" style="${bg}">${p.sell ? `<span class="${p.sell === best[sv].s ? 'pos' : ''}" style="${p.sell === best[sv].s ? 'font-weight:700' : ''}">${nfx.format(p.sell)}</span>` : '<span class="mut">—</span>'}</td>
        <td class="num" style="${bg}">${p.buy ? `<span class="${p.buy === best[sv].b ? 'gold' : 'mut'}" style="${p.buy === best[sv].b ? 'font-weight:700' : ''}">${nfx.format(p.buy)}</span>` : '<span class="mut">—</span>'}</td>`; }).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr><td>En iyi</td>${m.servers.map(sv => `<td class="num pos">${best[sv].s ? nfx.format(best[sv].s) : '—'}</td><td class="num gold">${best[sv].b ? nfx.format(best[sv].b) : '—'}</td>`).join('')}</tr></tfoot>
    </table></div>
  </div>
  <div class="row hint" style="margin-top:10px">
    <span><span class="pos">■</span> en ucuz satış (GB alırken) · <span class="gold">■</span> en yüksek alış (GB satarken). Fiyatlar 1 GB içindir (TL).</span>
    <span class="spacer"></span>
    <span>${gbBusy ? `<span data-gbstatus class="gold">${esc(ui.gbStatus || 'yenileniyor…')}</span> · ` : ''}Site güncellemesi: ${esc(m.updated || '—')} · Çekildi: ${esc(m.time)} (${m.mode === 'tarayici' ? 'gizli tarayıcı' : 'doğrudan'})${st.gbAuto ? ` · ${st.gbRefreshMin} dk'da bir otomatik` : ''}</span>
  </div>
  ${ui.gbErr ? `<div class="callout" style="margin-top:12px"><span class="neg">Son deneme başarısız</span> — ekrandaki veriler en son başarılı çekimden. <a href="#" class="gold" data-act="diag" data-url="${esc(st.gbUrl)}">Teşhis</a></div>` : ''}`;
};

/* ---------- CANLI PAZAR ---------- */
function parseAnyTables(html) {
  const doc = parseDoc(html);
  const out = [];
  doc.querySelectorAll('table').forEach(t => {
    const g = tableGrid(t).filter(r => r.some(c => c));
    if (g.length < 2) return;
    let hn = 1;
    const thRows = [...t.rows].filter(r => [...r.cells].every(c => c.tagName === 'TH')).length;
    if (thRows) hn = thRows;
    const head = g[hn - 1];
    const rows = g.slice(hn);
    if (rows.length) out.push({ head, rows });
  });
  // tablo yoksa: fiyat içeren satırlar
  let lines = [];
  if (!out.length) {
    if (doc.body) doc.body.querySelectorAll('div,li,p,tr,h1,h2,h3,h4,h5,section,article,br,td,span').forEach(el => el.append('\n'));
    const text = (doc.body ? doc.body.textContent : '').split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    lines = text.filter(l => /\d/.test(l) && /(tl|₺|gb|m\b|noah)/i.test(l) && l.length < 200).slice(0, 400);
  }
  return { tables: out, lines };
}
let marketBusy = false;
async function refreshMarket(quiet) {
  if (marketBusy) return; marketBusy = true;
  ui.marketStatus = 'çekiliyor…';
  try {
    const r = await smartFetch(withTest(S.settings.marketUrl), (html, d) => {
      const p = parseAnyTables(html);
      if (p.tables.length) return p;
      const cards = parseCards(parseDoc(html));
      if (cards) return { tables: [cards], lines: [] };
      if (d.ok && p.lines.length) return p;
      return null;
    }, t => { ui.marketStatus = t; const el = document.querySelector('[data-mcd]'); if (el) el.textContent = t; });
    const prevKeys = new Set(((ui.market && ui.market.tables) || []).flatMap(t => t.rows.map(x => x.join('|'))));
    ui.market = { ...r.res, time: new Date().toLocaleTimeString('tr-TR'), url: r.url, mode: r.mode, prevKeys, first: !ui.market };
    ui.marketErr = '';
    if (!quiet) toast('Canlı pazar güncellendi', 'ok');
  } catch (e) {
    ui.marketErr = e.message;
    if (!quiet) toast('Pazar alınamadı', 'err');
  } finally {
    marketBusy = false; ui.marketStatus = '';
    ui.marketNext = Date.now() + S.settings.marketRefreshSec * 1000;
    if (ui.page === 'pazar') render();
  }
}
VIEWS.pazar = () => {
  const m = ui.market, q = trLow(ui.mq || '');
  if (!m && !marketBusy && !ui.marketErr) setTimeout(() => refreshMarket(true), 0);
  const head = `<div class="row" style="margin-bottom:16px">
    <label class="search" style="width:320px"><input class="inp" placeholder="Item, sunucu veya satıcı ara" data-fk="mq" data-bind-ui="mq" value="${esc(ui.mq || '')}"></label>
    <label class="check"><input type="checkbox" data-mauto="1" ${ui.marketAuto !== false ? 'checked' : ''}> ${S.settings.marketRefreshSec} sn'de bir yenile</label>
    <span class="mut" data-mcd>${esc(ui.marketStatus || '')}</span>
    <div class="spacer"></div>
    ${m ? `<span class="mut">Son güncelleme: ${esc(m.time)}</span>` : ''}
    <button class="btn pri" data-act="market-refresh">${ICON.refresh} Yenile</button>
  </div>`;
  if (!m) return head + `<div class="card">${ui.marketErr ? errBox('Pazar verisi alınamadı', ui.marketErr, S.settings.marketUrl) : empty('Yükleniyor…', esc(ui.marketStatus || 'Canlı pazar sayfası çekiliyor. Gerekirse gizli tarayıcı açılır, bu 10–15 sn sürebilir.'))}</div>`;
  const match = r => !q || trLow(r.join(' ')).includes(q);
  let body = '';
  if (m.tables.length) {
    body = m.tables.map((t, ti) => {
      const rows = t.rows.filter(match);
      return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
        <div class="card-h" style="padding:14px 18px 0"><h3>${m.tables.length > 1 ? 'Tablo ' + (ti + 1) : 'İlanlar'}</h3><span class="sub">${rows.length} / ${t.rows.length} satır</span></div>
        <div class="tbl-wrap" style="border:0;border-radius:0;border-top:1px solid var(--line);max-height:calc(100vh - 290px)"><table>
          <thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(0, 500).map(r => { const isNew = !m.first && !m.prevKeys.has(r.join('|')); return `<tr ${isNew ? 'style="background:rgba(62,194,122,.07)"' : ''}>${r.map(c => `<td class="${isNumCell(c) ? 'num' : ''}">${esc(c)}</td>`).join('')}${isNew ? '<td><span class="badge g">yeni</span></td>' : ''}</tr>`; }).join('')}</tbody>
        </table></div></div>`;
    }).join('');
  } else {
    const lines = m.lines.filter(l => match([l]));
    body = `<div class="card"><div class="card-h"><h3>Sayfadaki fiyatlı satırlar</h3><span class="sub">${lines.length} satır</span></div><div class="stack" style="gap:4px">${lines.slice(0, 300).map(l => `<div class="transfer">${esc(l)}</div>`).join('')}</div></div>`;
  }
  return head + (ui.marketErr ? `<div class="callout" style="margin-bottom:12px"><span class="neg">Son yenileme başarısız</span> — gösterilen veriler ${esc(m.time)} tarihli. <a href="#" class="gold" data-act="diag" data-url="${esc(S.settings.marketUrl)}">Teşhis</a></div>` : '') + body + `<div class="hint">Kaynak: ${esc(m.url)} · ${m.mode === 'tarayici' ? 'gizli tarayıcı ile okundu' : 'doğrudan okundu'}${m.tables[0] && m.tables[0].cards ? ' · ilan kartlarından çıkarıldı' : ''} — yeni ilanlar yeşil ile işaretlenir.</div>`;
};

/* ---------- EVENT TAKVİMİ ---------- */
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
function occurrences(from, toMs) {
  const out = [];
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  for (let d = -1; d < 8; d++) {
    const day = new Date(start); day.setDate(start.getDate() + d);
    for (const e of S.events) {
      if (e.off || !e.days.includes(day.getDay())) continue;
      if (e.until && localDate(day) > e.until) continue;
      for (const t of e.times) {
        const [h, mi] = t.split(':').map(Number);
        const st = new Date(day); st.setHours(h, mi, 0, 0);
        const en = new Date(st.getTime() + (e.dur || 30) * 60000);
        if (en.getTime() >= from.getTime() && st.getTime() <= toMs) out.push({ e, st, en, t });
      }
    }
  }
  return out.sort((a, b) => a.st - b.st);
}
function fmtCD(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return (d ? d + 'g ' : '') + pad(h) + ':' + pad(m) + ':' + pad(ss);
}
VIEWS.event = () => {
  const now = new Date();
  const occ = occurrences(now, now.getTime() + 7 * 864e5);
  const live = occ.filter(o => o.st <= now && o.en > now);
  const next = occ.filter(o => o.st > now);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59);
  const today = occurrences(new Date(new Date().setHours(0, 0, 0, 0)), todayEnd.getTime()).filter(o => o.st.getDate() === now.getDate());
  const top = `<div class="row" style="margin-bottom:16px">
    <label class="check"><input type="checkbox" data-set-check="eventNotify" ${S.settings.eventNotify ? 'checked' : ''}> ${S.settings.eventNotifyMin} dk önce hatırlat</label>
    <div class="spacer"></div>
    <span class="hint">${esc(USKO_EVENTS_INFO)}</span>
    <button class="btn" data-act="ev-preset">${ICON.refresh} Güncel USKO takvimini yükle</button>
    <button class="btn" data-act="ev-import">${ICON.dl} Siteden içe aktar</button>
    <button class="btn pri" data-act="ev-add">${ICON.plus} Event ekle</button></div>`;
  if (!S.events.length) return top + `<div class="card">${empty('Takvim boş', 'Event adlarını, günlerini ve saatlerini ekleyin; sıradaki event için geri sayım ve hatırlatma çalışır. “Siteden içe aktar” ile event sayfasındaki saatleri okumayı deneyebilirsiniz.')}</div>`;
  const chip = o => `<span class="badge" style="background:${o.e.color || 'var(--panel2)'}22;color:${o.e.color || 'var(--tx2)'}">${o.t}</span>`;
  return top + `
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card stat" style="--glow:var(--green)"><div class="lbl"><span class="chip" style="background:var(--green)"></span>Şu an aktif</div>
      ${live.length ? live.map(o => `<div class="val" style="font-size:20px">${esc(o.e.name)}</div><div class="sub2">bitişe <b data-cd="${o.en.getTime()}">${fmtCD(o.en - now)}</b></div>`).join('') : '<div class="val mut" style="font-size:20px">—</div><div class="sub2">aktif event yok</div>'}
    </div>
    <div class="card stat" style="--glow:var(--gold);grid-column:span 2"><div class="lbl"><span class="chip" style="background:var(--gold)"></span>Sıradaki</div>
      ${next[0] ? `<div class="row" style="align-items:baseline;margin-top:6px"><div class="val" style="margin:0">${esc(next[0].e.name)}</div><span class="mut">${DAYS[next[0].st.getDay()]} ${next[0].t}</span><span class="spacer"></span><div class="big-result gold" data-cd="${next[0].st.getTime()}">${fmtCD(next[0].st - now)}</div></div>
        <div class="sub2">${next.slice(1, 4).map(o => `${esc(o.e.name)} · ${DAYS[o.st.getDay()].slice(0, 3)} ${o.t}`).join('  —  ')}</div>` : '<div class="val mut">—</div>'}
    </div>
  </div>
  <div class="grid g-wide">
    <div class="card">
      <div class="card-h"><h3>Haftalık takvim</h3></div>
      <div class="week-scroll"><div class="week-grid">
        ${WEEK.map(d => { const evs = S.events.filter(e => !e.off && e.days.includes(d) && !(e.until && localDate() > e.until)).flatMap(e => e.times.map(t => ({ e, t }))).sort((a, b) => a.t.localeCompare(b.t)); return `
        <div style="background:var(--bg2);border:1px solid ${d === now.getDay() ? 'var(--gold)' : 'var(--line)'};border-radius:8px;padding:8px;min-height:140px">
          <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;${d === now.getDay() ? 'color:var(--gold2)' : 'color:var(--tx2)'}">${DAYS[d]}</div>
          ${evs.map(x => `<div style="font-size:12px;padding:4px 6px;border-radius:5px;margin-bottom:4px;background:${x.e.color || '#5aa7ff'}1f;border-left:3px solid ${x.e.color || '#5aa7ff'}"><b>${x.t}</b> ${esc((x.e.name.match(/\(([^)]+)\)\s*$/) || [])[1] || x.e.name)}</div>`).join('') || '<div class="hint">—</div>'}
        </div>`; }).join('')}
      </div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Bugün</h3><span class="sub">${DAYS[now.getDay()]}</span></div>
        <div class="stack" style="gap:6px">${today.map(o => { const st = o.en <= now ? 'past' : o.st <= now ? 'live' : 'soon'; return `<div class="transfer" style="${st === 'past' ? 'opacity:.45' : st === 'live' ? 'border-color:var(--green)' : ''}"><b class="mono">${o.t}</b><span>${esc(o.e.name)}</span><span class="spacer"></span>${st === 'live' ? '<span class="badge g">aktif</span>' : st === 'soon' ? `<span class="mut" data-cd="${o.st.getTime()}">${fmtCD(o.st - now)}</span>` : '<span class="mut">bitti</span>'}</div>`; }).join('') || '<div class="mut">Bugün event yok.</div>'}</div>
      </div>
      <div class="card" style="padding:0;overflow:hidden"><div class="card-h" style="padding:14px 18px 0"><h3>Eventler</h3></div>
        <div class="tbl-wrap" style="border:0;border-radius:0;border-top:1px solid var(--line)"><table><tbody>${S.events.map(e => `<tr style="${e.off ? 'opacity:.5' : ''}">
          <td><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${e.color || '#5aa7ff'};margin-right:7px"></span><b>${esc(e.name)}</b><div class="hint">${e.days.length === 7 ? 'Her gün' : WEEK.filter(d => e.days.includes(d)).map(d => DAYS[d].slice(0, 3)).join(', ')} · ${e.times.join(', ')} · ${e.dur} dk${e.until ? ' · ' + fmtDate(e.until) + "'e kadar" : ''}</div>${e.note ? `<div class="hint" style="color:var(--tx2)">${esc(e.note)}</div>` : ''}</td>
          <td>${actBtns('ev', e.id)}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>
  </div>`;
};
const EV_COLORS = [['#5aa7ff', 'Mavi'], ['#3ec27a', 'Yeşil'], ['#e3b554', 'Altın'], ['#ef5b5b', 'Kırmızı'], ['#a58bff', 'Mor'], ['#ff9f5a', 'Turuncu']];
function eventForm(e, preset) {
  const isNew = !e;
  e = e || Object.assign({ id: uid(), name: '', days: [0, 1, 2, 3, 4, 5, 6], times: [], dur: 30, color: '#5aa7ff', off: false, note: '' }, preset || {});
  openForm({
    title: isNew ? 'Event ekle' : 'Düzenle: ' + e.name,
    data: { name: e.name, times: e.times.join(', '), dur: e.dur, color: e.color, off: e.off ? '1' : '', until: e.until || '', note: e.note || '' },
    fields: [
      { k: 'name', label: 'Event adı', type: 'text', full: true, placeholder: 'örn. Border Defence War' },
      { k: 'times', label: 'Saatler (virgülle)', type: 'text', placeholder: 'örn. 13:00, 20:30', hint: 'Bilgisayarınızın saatine göre' },
      { k: 'dur', label: 'Süre (dakika)', type: 'number' },
      { k: 'color', label: 'Renk', type: 'select', options: EV_COLORS },
      { k: 'off', label: 'Durum', type: 'select', options: [['', 'Açık'], ['1', 'Kapalı (gizle)']] },
      { k: 'until', label: 'Bitiş tarihi (dönemsel event)', type: 'date' },
      { k: 'note', label: 'Not', type: 'text', full: true, placeholder: 'örn. Min. 70 seviye' },
    ],
    extra: `<div style="margin-top:14px"><div class="hint" style="margin-bottom:6px">Günler</div><div class="row" id="evDays">${WEEK.map(d => `<label class="check"><input type="checkbox" value="${d}" ${e.days.includes(d) ? 'checked' : ''}> ${DAYS[d].slice(0, 3)}</label>`).join('')}</div></div>`,
    onSave: v => {
      const times = (v.times.match(/\d{1,2}[:.]\d{2}/g) || []).map(t => { const [h, m] = t.split(/[:.]/); return pad(+h) + ':' + m; }).filter(t => +t.slice(0, 2) < 24);
      const days = [...document.querySelectorAll('#evDays input:checked')].map(x => +x.value);
      if (!v.name.trim() || !times.length || !days.length) { toast('Ad, en az bir saat ve gün girin.', 'err'); return false; }
      Object.assign(e, { name: v.name.trim(), times: [...new Set(times)].sort(), days, dur: Math.max(1, Math.round(parseNum(v.dur))) || 30, color: v.color, off: !!v.off, until: v.until || '', note: v.note.trim() });
      if (isNew) S.events.push(e);
      save(); render(); toast('Kaydedildi', 'ok');
    },
  });
}
const DAY_WORDS = [[0, /pazar(?!tesi)|sunday|\bsun\b/i], [1, /pazartesi|monday|\bmon\b/i], [2, /salı|sali|tuesday|\btue/i], [3, /çarşamba|carsamba|wednesday|\bwed/i], [4, /perşembe|persembe|thursday|\bthu/i], [5, /cuma(?!rtesi)|friday|\bfri\b/i], [6, /cumartesi|saturday|\bsat\b/i]];
async function importEvents() {
  openForm({ title: 'Siteden event içe aktar', wide: true, data: { url: S.settings.eventsUrl }, fields: [{ k: 'url', label: 'Event sayfası adresi', type: 'text', full: true }], extra: '<div id="evImp" style="margin-top:14px"><span class="mut">Sayfa getiriliyor…</span></div>', onSave: () => true });
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="modal-close">Kapat</button><button class="btn pri" data-act="ev-import-run">${ICON.refresh} Getir</button>`;
  runEventImport();
}
async function runEventImport() {
  const box = $('#evImp'); if (!box) return;
  const url = ($('#mform [name=url]') || {}).value || S.settings.eventsUrl;
  S.settings.eventsUrl = url; save();
  box.innerHTML = '<span class="mut">Sayfa getiriliyor…</span>';
  try {
    const r = await smartFetch(withTest(url), (html, d) => {
      if (!d.ok) return null;
      const doc = parseDoc(html);
      let cands = [];
      doc.querySelectorAll('table').forEach(t => tableGrid(t).forEach(row => { const line = row.join(' | '); if (/\d{1,2}[:.]\d{2}/.test(line)) cands.push(line); }));
      if (!cands.length) {
        const cards = parseCards(doc);
        if (cards) cands = cards.rows.map(x => x.filter(Boolean).join(' | ')).filter(l => /\b\d{1,2}:\d{2}\b/.test(l));
      }
      if (!cands.length && doc.body) {
        doc.body.querySelectorAll('div,li,p,tr,h1,h2,h3,h4,section,article,br,td').forEach(el => el.append('\n'));
        cands = doc.body.textContent.split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(l => /\b\d{1,2}:\d{2}\b/.test(l) && l.length < 220);
      }
      cands = [...new Set(cands)].slice(0, 150);
      return cands.length ? cands : null;
    }, t => { const b = $('#evImp'); if (b) b.innerHTML = `<span class="mut">${esc(t)}</span>`; });
    const cands = r.res;
    ui.evCands = cands;
    box.innerHTML = `<div class="hint" style="margin-bottom:8px">${cands.length} satırda saat bulundu (${esc(new URL(r.url).hostname)}, ${r.mode === 'tarayici' ? 'gizli tarayıcı' : 'doğrudan'}). İstediğinizi “Ekle” ile düzenleyip kaydedin:</div>
      <div class="stack" style="gap:5px;max-height:360px;overflow:auto">${cands.map((c, i) => `<div class="transfer"><span style="font-size:12.5px">${esc(c)}</span><span class="spacer"></span><button class="btn sm" data-act="ev-cand" data-i="${i}">${ICON.plus} Ekle</button></div>`).join('')}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="callout"><span class="neg">Saat bilgisi okunamadı.</span><div class="hint" style="margin-top:6px">${esc(e.message)}</div><div style="margin-top:8px"><a href="#" class="gold" data-act="diag" data-url="${esc(url)}">Teşhis raporu oluştur</a></div></div>`;
  }
}
function candToEvent(line) {
  const times = line.match(/\b\d{1,2}[:.]\d{2}\b/g) || [];
  let days = DAY_WORDS.filter(([, re]) => re.test(line)).map(([d]) => d);
  if (!days.length || /her\s*gün|daily|every\s*day/i.test(line)) days = [0, 1, 2, 3, 4, 5, 6];
  const name = line.split('|').map(s => s.trim()).find(s => s && !/\d{1,2}[:.]\d{2}/.test(s) && !DAY_WORDS.some(([, re]) => re.test(s))) || line.replace(/\b\d{1,2}[:.]\d{2}\b/g, '').replace(/[|,-]+/g, ' ').trim().slice(0, 40);
  return { name, times: times.map(t => t.replace('.', ':').padStart(5, '0')), days };
}

let notified = new Set();
function checkEventNotify() {
  if (!S.settings.eventNotify || !S.events.length) return;
  const now = Date.now(), lead = (S.settings.eventNotifyMin || 5) * 60000;
  occurrences(new Date(), now + lead + 60000).forEach(o => {
    const dt = o.st.getTime() - now;
    const key = o.e.id + o.st.getTime();
    if (dt > 0 && dt <= lead && !notified.has(key)) {
      notified.add(key);
      const msg = `${o.e.name} ${Math.ceil(dt / 60000)} dk sonra başlıyor (${o.t})`;
      toast('⏰ ' + msg);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('KO Hesap', { body: msg, icon: 'icon.svg' }); } catch { }
    }
  });
}

/* ---------- PUS HESAPLAYICI (sepet) ---------- */
const oldPusView = VIEWS.pus;
const kcItemTL = kc => kcTL() * kc;
VIEWS.pus = () => {
  const st = S.settings, P = S.pus, k = kcTL();
  const q = trLow(ui.pusQ || ''), cat = ui.pusCat || 'all';
  const cats = [...new Set(P.catalog.map(x => x.cat))];
  const list = P.catalog.filter(x => (cat === 'all' || x.cat === cat) && (!q || trLow(x.name).includes(q)));
  const cart = P.cart.map(c => ({ c, it: P.catalog.find(x => x.id === c.id) })).filter(x => x.it);
  const totKC = sum(cart, x => x.it.kc * x.c.qty);
  const packKC = st.kcPackKC || 400;
  const packs = Math.ceil(totKC / packKC);
  const cashTL = packs * (st.kcPackTL || 0);
  const propTL = totKC * k;
  const gb = st.gbTL ? propTL / st.gbTL : 0;
  const top = `
  <div class="grid g-wide" style="margin-bottom:16px">
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 18px 12px" class="stack">
        <div class="row"><h3 style="margin:0;font:600 15px var(--head)">PUS item fiyatları</h3><span class="mut">${P.catalog.length} item</span><span class="spacer"></span>
          <label class="search" style="width:230px"><input class="inp" placeholder="Item ara" data-fk="pusQ" data-bind-ui="pusQ" value="${esc(ui.pusQ || '')}"></label>
          <button class="btn sm" data-act="pusc-add">${ICON.plus} Özel item</button></div>
        <div class="seg" style="flex-wrap:wrap;align-self:flex-start">${[['all', 'Tümü'], ...cats.map(c => [c, c])].map(([v, l]) => `<button class="${cat === v ? 'on' : ''}" data-act="set" data-k="pusCat" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>
      </div>
      <div class="tbl-wrap" style="border:0;border-radius:0;border-top:1px solid var(--line);max-height:520px"><table>
        <thead><tr><th>Item</th><th class="num" style="width:110px">KC</th><th class="num">TL</th><th class="num">GB</th><th></th></tr></thead>
        <tbody>${list.map(x => `<tr><td>${esc(x.name)}<div class="hint">${esc(x.cat)}</div></td>
          <td><input class="inp cell num" data-fk="pk-${x.id}" data-pusk="${x.id}" value="${fmtN(x.kc)}"></td>
          <td class="num">${k ? fmtTL(kcItemTL(x.kc)) : '<span class="mut">—</span>'}</td>
          <td class="num mut">${k && st.gbTL ? nf2.format(kcItemTL(x.kc) / st.gbTL) : '—'}</td>
          <td style="width:84px;white-space:nowrap"><button class="btn sm pri" data-act="cart-add" data-id="${x.id}" title="Sepete ekle">${ICON.plus}</button>${x.custom ? `<button class="icon-btn" data-act="pusc-del" data-id="${x.id}" title="Sil">${ICON.del}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5">${empty('Bulunamadı')}</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Sepet</h3>${cart.length ? `<button class="btn sm ghost" data-act="cart-clear">Temizle</button>` : ''}</div>
      <div class="form" style="margin-bottom:14px">
        <label class="f">${fmtN(packKC)} KC paket fiyatı (TL)<input class="inp num" data-fk="kcPackTL2" data-set="kcPackTL" data-num="1" value="${st.kcPackTL ? nf2.format(st.kcPackTL) : ''}" placeholder="örn. 227,50"></label>
        <label class="f">1 GB (TL) · ${esc(st.server || '')}<input class="inp num" data-fk="gbTL2" data-set="gbTL" data-num="1" value="${st.gbTL ? nf2.format(st.gbTL) : ''}"></label>
      </div>
      ${cart.length ? `<div class="stack" style="gap:6px;max-height:230px;overflow:auto">${cart.map(({ c, it }) => `
        <div class="transfer"><span style="flex:1;min-width:0">${esc(it.name)}<div class="hint">${fmtN(it.kc)} KC</div></span>
          <input class="inp num" style="width:64px;padding:5px 8px" data-fk="cq-${it.id}" data-cartq="${it.id}" value="${c.qty}">
          <span class="num" style="width:92px">${k ? fmtTL(kcItemTL(it.kc * c.qty)) : fmtN(it.kc * c.qty) + ' KC'}</span>
          <button class="icon-btn" data-act="cart-del" data-id="${it.id}">${ICON.del}</button></div>`).join('')}</div>`
      : '<div class="empty" style="padding:20px"><b>Sepet boş</b>Soldan + ile item ekleyin.</div>'}
      <div class="kv" style="margin-top:16px">
        <span class="k">Toplam KC</span><span class="v">${fmtN(totKC)}</span>
        <span class="k">Gereken paket</span><span class="v">${packs} × ${fmtN(packKC)} KC${totKC ? ` <span class="mut" style="font-weight:400">(${fmtN(packs * packKC - totKC)} KC artar)</span>` : ''}</span>
        <span class="k">Ödenecek nakit</span><span class="v">${st.kcPackTL ? fmtTL(cashTL) : '—'}</span>
        <span class="sep"></span>
        <span class="k">Orantılı maliyet</span><span class="v big-result" style="font-size:22px">${k ? fmtTL(propTL) : '—'}</span>
        <span class="k">GB karşılığı</span><span class="v gold">${gb ? nf2.format(gb) + ' GB' : '—'}</span>
        <span class="k">Oyun içi (noah)</span><span class="v">${gb ? fmtN(gb * st.gbNoah) : '—'}</span>
        <span class="k">USD</span><span class="v">${k && st.usdTL ? '$' + nf2.format(propTL / st.usdTL) : '—'}</span>
      </div>
      ${cart.length ? `<button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="cart-buy">Satın aldım — giderlere kaydet</button>` : ''}
      ${!k ? '<div class="hint" style="margin-top:10px">TL hesabı için paket fiyatını girin.</div>' : ''}
    </div>
  </div>`;
  return top + oldPusView();
};

/* ---------- teşhis ---------- */
function errBox(title, err, url) {
  return `<div class="empty"><b>${esc(title)}</b>
    <div class="stack" style="gap:4px;margin:10px auto;max-width:760px;text-align:left">${String(err).split(' · ').map(x => `<div class="hint">• ${esc(x)}</div>`).join('')}</div>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="diag" data-url="${esc(url)}">Teşhis raporu oluştur</button><button class="btn ghost" data-act="go" data-id="ayar">Adresleri düzenle</button></div></div>`;
}
async function runDiag(url) {
  openForm({ title: 'Teşhis raporu', wide: true, data: {}, fields: [], extra: '<div id="diagBox"><span class="mut">Sayfa iki yöntemle deneniyor… İlk seferde gizli tarayıcının açılması 20–30 sn sürebilir.</span></div>', onSave: () => true });
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="modal-close">Kapat</button><button class="btn" data-act="diag-save">${ICON.dl} Rapor dosyasını kaydet</button><button class="btn pri" data-act="diag-copy">${ICON.copy} Kopyala</button>`;
  let rep = `KO Hesap teşhis — ${new Date().toLocaleString('tr-TR')}\nAdres: ${url}\n`;
  const full = [];
  for (const render of [false, true]) {
    const t0 = Date.now();
    try {
      const d = await rawFetch(url, render);
      const doc = d.html ? parseDoc(d.html) : null;
      rep += `\n[${render ? 'GİZLİ TARAYICI' : 'DOĞRUDAN'}] durum: ${d.status || '-'} ok: ${d.ok} süre: ${Date.now() - t0} ms boyut: ${(d.html || '').length}${d.error ? ' hata: ' + d.error : ''}\n`;
      if (doc) {
        rep += `başlık: ${doc.title} | tablo: ${doc.querySelectorAll('table').length} | script: ${doc.querySelectorAll('script').length}\n`;
        const apis = [...new Set((d.html.match(/https?:\/\/[^"'\s<>]+(api|json|graphql|socket)[^"'\s<>]*/gi) || []).concat(d.html.match(/["'](\/api\/[^"']+)["']/gi) || []))].slice(0, 25);
        if (apis.length) rep += 'olası veri adresleri:\n' + apis.map(a => '  ' + a.replace(/["']/g, '')).join('\n') + '\n';
        if (d.requests && d.requests.length) rep += 'sayfanın arka planda çağırdığı adresler:\n' + d.requests.map(q => `  [${q.type || '-'} ${q.status || ''}] ${q.url}`).join('\n') + '\n';
        rep += 'metin:\n' + (d.text || '').slice(0, 2500) + '\n';
        full.push(`===== ${render ? 'gizli-tarayici' : 'dogrudan'}.html =====\n` + d.html);
      }
    } catch (e) { rep += `\n[${render ? 'GİZLİ TARAYICI' : 'DOĞRUDAN'}] hata: ${e.message}\n`; }
    const b = $('#diagBox'); if (b) b.innerHTML = `<textarea class="inp mono" rows="18" readonly style="width:100%">${esc(rep)}</textarea>`;
  }
  ui.diag = { rep, full: rep + '\n\n' + full.join('\n\n') };
}
/* ---------- olaylar ---------- */
Object.assign(ACTIONS, {
  diag: el => runDiag(el.dataset.url),
  'diag-copy': async () => { try { await navigator.clipboard.writeText(ui.diag.rep); toast('Rapor kopyalandı', 'ok'); } catch { toast('Kopyalanamadı', 'err'); } },
  'diag-save': () => { if (ui.diag) download('kohesap-teshis-' + localDate() + '.txt', ui.diag.full, 'text/plain'); },
  'gb-refresh': () => { toast('GB fiyatları çekiliyor…'); refreshGB(false); },
  'gb-server': el => { S.settings.server = el.dataset.v; applyGB(); save(); render(); },
  'market-refresh': () => refreshMarket(false),
  'ev-add': () => eventForm(null),
  'ev-edit': el => eventForm(S.events.find(e => e.id === el.dataset.id)),
  'ev-del': el => confirmBox('Event sil', 'Bu event silinsin mi?', 'Sil', () => { S.events = S.events.filter(e => e.id !== el.dataset.id); save(); render(); }),
  'ev-import': importEvents,
  'ev-preset': () => confirmBox('Güncel USKO takvimi', 'Hazır USKO etkinlik saatleri yüklensin mi? Daha önce yüklenen hazır eventler güncellenir, kendi eklediğin eventlere dokunulmaz.', 'Yükle', () => {
    const fresh = presetEvents();
    S.events = S.events.filter(e => e.src !== 'usko').concat(fresh);
    save(); render(); toast('USKO takvimi yüklendi', 'ok');
  }),
  'ev-import-run': runEventImport,
  'ev-cand': el => { const c = candToEvent(ui.evCands[+el.dataset.i]); eventForm(null, c); },
  'cart-add': el => { const c = S.pus.cart.find(x => x.id === el.dataset.id); if (c) c.qty++; else S.pus.cart.push({ id: el.dataset.id, qty: 1 }); save(); render(); },
  'cart-del': el => { S.pus.cart = S.pus.cart.filter(x => x.id !== el.dataset.id); save(); render(); },
  'cart-clear': () => { S.pus.cart = []; save(); render(); },
  'cart-buy': () => confirmBox('Alımları kaydet', 'Sepetteki itemler bugünün tarihiyle PUS alımı olarak kaydedilsin ve sepet temizlensin mi?', 'Kaydet', () => {
    S.pus.cart.forEach(c => { const it = S.pus.catalog.find(x => x.id === c.id); if (it) S.pus.buys.push({ id: uid(), date: localDate(), item: it.name, kc: it.kc, qty: c.qty }); });
    S.pus.cart = []; save(); render(); toast('Alımlar kaydedildi', 'ok');
  }),
  'pusc-add': () => openForm({
    title: 'Özel PUS itemi', data: { name: '', cat: 'Özel', kc: '' },
    fields: [{ k: 'name', label: 'Item adı', type: 'text', full: true }, { k: 'cat', label: 'Kategori', type: 'text', list: [...new Set(S.pus.catalog.map(x => x.cat))] }, { k: 'kc', label: 'Fiyat (KC)', type: 'number' }],
    onSave: v => { if (!v.name.trim() || !parseNum(v.kc)) { toast('Ad ve KC girin.', 'err'); return false; } S.pus.catalog.unshift({ id: uid(), name: v.name.trim(), cat: v.cat.trim() || 'Özel', kc: parseNum(v.kc), custom: true }); save(); render(); },
  }),
  'pusc-del': el => { S.pus.catalog = S.pus.catalog.filter(x => x.id !== el.dataset.id); S.pus.cart = S.pus.cart.filter(x => x.id !== el.dataset.id); save(); render(); },
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.gbpick) { S.settings.gbPick = t.value; applyGB(); save(); render(); }
  else if (d.pusk) { const it = S.pus.catalog.find(x => x.id === d.pusk); it.kc = Math.max(0, parseNum(t.value)); save(); render(); }
  else if (d.cartq) { const c = S.pus.cart.find(x => x.id === d.cartq); const q = Math.round(parseNum(t.value)); if (q <= 0) S.pus.cart = S.pus.cart.filter(x => x !== c); else c.qty = q; save(); render(); }
  else if (d.mauto) { ui.marketAuto = t.checked; ui.marketNext = Date.now() + S.settings.marketRefreshSec * 1000; }
  else if (d.setCheck === 'eventNotify' && t.checked) { try { window.Notification && Notification.permission === 'default' && Notification.requestPermission(); } catch { } }
});

/* ---------- zamanlayıcılar ---------- */
function startLiveTimers() {
  let lastMin = -1;
  ui.marketNext = Date.now() + S.settings.marketRefreshSec * 1000;
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-cd]').forEach(el => {
      const ms = +el.dataset.cd - now;
      if (ms <= 0 && ui.page === 'event' && $('#modalBack').hidden) { render(); return; }
      el.textContent = fmtCD(ms);
    });
    if (ui.page === 'pazar' && ui.marketAuto !== false) {
      const left = Math.max(0, Math.round((ui.marketNext - now) / 1000));
      const cd = document.querySelector('[data-mcd]'); if (cd) cd.textContent = (typeof MK !== 'undefined' && MK.busy) ? '' : `(${left} sn)`;
      if (left <= 0) { ui.marketNext = now + S.settings.marketRefreshSec * 1000; refreshMarket(true); }
    }
    const m = new Date().getMinutes();
    if (m !== lastMin) {
      lastMin = m;
      checkEventNotify();
      if (S.settings.gbAuto && S.gbMarket && now - (S.gbMarket.ts || 0) > S.settings.gbRefreshMin * 60000) refreshGB(true);
    }
  }, 1000);
}
