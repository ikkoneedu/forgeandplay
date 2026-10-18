'use strict';
/* ==========================================================================
   KO Ekip — Site İlanları (item + karakter), sunucu seçmeli, item aramalı
   • Kopazar ve ByNoGame: forgeandplay.com sunucusu okur (/api/kohesap/ilan)
   • Knightpin ve Oyuneks: bot koruması yüzünden yalnızca Windows uygulamasının
     tarayıcısıyla okunur; uygulama sonucu ekiple paylaşır (kohesapMarket/ilan-*),
     web / telefon aynı aramayı yapınca paylaşılan sonucu da gösterir.
   ========================================================================== */
const IL = { kind: 'item', q: '', server: '', sort: 'asc', site: 'all', rows: [], sources: [], busy: false, at: 0, err: '', shared: null, prog: '' };
ui.il = IL;
const IL_SERVERS = ['Zero', 'Agartha', 'Pandora', 'Felis', 'Dryads', 'Destan', 'Minark', 'Oreads', 'Zion'];
const IL_SITE_COLOR = { Kopazar: '#5aa7ff', ByNoGame: '#3ec27a', Knightpin: '#e3b554', Oyuneks: '#a58bff' };
ICON.ilan = I('<path d="M3 7h18"/><path d="M6 3h12l3 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M9 12h6"/><path d="M9 16h4"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'pazar') + 1, 0, { id: 'ilan', t: 'Site İlanları', d: 'Kopazar, ByNoGame, Knightpin, Oyuneks · item ve karakter ilanları, sunucuya göre' });
try { const p = JSON.parse(localStorage.getItem('ko-ilan') || '{}'); if (p.server) IL.server = p.server; if (p.kind) IL.kind = p.kind; } catch { }
const ilSave = () => { try { localStorage.setItem('ko-ilan', JSON.stringify({ server: IL.server, kind: IL.kind })); } catch { } };

/* ---------- ortak süzgeç (sunucudaki matcher ile aynı mantık) ---------- */
function ilMatcher(q) {
  const words = trLow(q).replace(/ı/g, 'i').replace(/[^a-z0-9ğüşöç+ ]/g, ' ').split(/\s+/).filter(Boolean);
  const rev = words.some(w => /^rev(erse)?$/.test(w)), plus = words.find(w => /^\+\d+$/.test(w));
  const rest = words.filter(w => !/^rev(erse)?$/.test(w) && !/^\+\d+$/.test(w));
  return r => {
    const n = trLow(r.name + ' ' + (r.sub || '')).replace(/ı/g, 'i');
    if (rest.some(w => !n.includes(w))) return false;
    if (rev && !/rev/i.test(r.name + ' ' + (r.grade || ''))) return false;
    if (plus && r.plus !== +plus.slice(1)) return false;
    return true;
  };
}
const ilTxt = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const ilNum = s => Number(String(s).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const ilPlus = n => { const m = String(n).match(/\+\s?(\d{1,2})\b/); return m ? +m[1] : undefined; };
const ilSrv = s => IL_SERVERS.find(x => trLow(x) === trLow(String(s).trim())) || String(s || '').trim();
const ilKw = q => q.replace(/\b(rev(erse)?\.?)(?=\s|$)|\+\d+/gi, ' ').replace(/\s+/g, ' ').trim();

/* ---------- Knightpin (Oyunex altyapısı; Oyuneks de büyük ihtimalle aynı kart yapısı) ---------- */
function ilParseMpCards(html, kind, site, base) {
  const out = [];
  const parts = html.split(/<div class="mp-card[^"]*" data-product-id="/).slice(1);
  for (const c of parts) {
    const id = (c.match(/^(\d+)/) || [])[1];
    const a = c.match(/<a[^>]*class="[^"]*mp-card-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) || c.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*mp-card-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const price = ilNum((c.match(/mp-grid-current">\s*([\d.,]+)/) || [])[1] || '');
    if (!a || !price) continue;
    const url = new URL(a[1], base).href;
    const r = { site, kind, name: ilTxt(a[2]), server: ilSrv((c.match(/mp-server-name[^>]*>([^<]+)/) || [])[1] || ''), price, url, id };
    if (kind === 'item') { r.plus = ilPlus(r.name); r.grade = /reverse|rev\./i.test(r.name) ? 'Reverse' : ''; r.seller = ilTxt((c.match(/mp-list-seller-sales">([^<]+)/) || [])[1] || ''); }
    else {
      const parts2 = r.name.split(' - ').map(s => s.trim());
      if (IL_SERVERS.some(s => trLow(s) === trLow(parts2[0]))) { r.server = ilSrv(parts2[0]); r.cls = parts2.slice(1).join(' - '); }
      else r.cls = r.name;
      r.lvl = ilTxt((c.match(/mp-character-level[^>]*>([^<]+)/) || [])[1] || '');
      r.np = ilTxt((c.match(/mp-character-np[\s\S]*?class="value">([^<]+)/) || [])[1] || '');
      r.sub = [ilTxt((c.match(/v3-badge">([\s\S]*?)<\/div>/) || [])[1] || ''), ilTxt((c.match(/mp-character-completion-text[^>]*>([^<]+)/) || [])[1] || ''), ilTxt((c.match(/<img[^>]*alt="([^"]*)"/) || [])[1] || '')].filter(Boolean).join(' · ');
      r.name = `${r.cls || 'Karakter'} ${r.lvl || ''}`.trim();
    }
    out.push(r);
  }
  return out;
}
/** Bilinmeyen yapı için genel okuyucu: ilan bağlantısı + yakınındaki fiyat / sunucu */
function ilParseGeneric(html, kind, site, base, linkRe) {
  const out = [], seen = new Set();
  const re = new RegExp(`<a[^>]*href="([^"]*${linkRe}[^"]*-\\d+)"[^>]*>([\\s\\S]*?)<\\/a>`, 'g');
  const hits = []; let m;
  while ((m = re.exec(html))) hits.push({ i: m.index, href: m[1], inner: m[2], tag: m[0] });
  hits.forEach((h, k) => {
    const url = new URL(h.href, base).href; if (seen.has(url)) return;
    const end = k + 1 < hits.length ? hits[k + 1].i : h.i + 4000;
    const blk = html.slice(Math.max(0, h.i - 1500), Math.min(end, h.i + 4000));
    const text = ilTxt(blk);
    const prices = [...text.matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺)/g)].map(x => ilNum(x[1])).filter(Boolean);
    let name = ilTxt(h.inner) || (h.tag.match(/title="([^"]+)"/) || [])[1] || (blk.match(/<img[^>]*alt="([^"]+)"/) || [])[1] || '';
    if (!prices.length || !name || name.length < 3) return;
    seen.add(url);
    const srv = IL_SERVERS.find(s => new RegExp('\\b' + s + '\\b', 'i').test(text)) || '';
    const r = { site, kind, name, server: srv, price: Math.min(...prices.slice(0, 2)), url };
    if (kind === 'item') { r.plus = ilPlus(name); r.grade = /reverse|rev\./i.test(name) ? 'Reverse' : ''; }
    else { r.lvl = (name.match(/\b(\d{2}\/\d{1,2})\b/) || [])[1] || ''; r.sub = name; r.name = name.length > 60 ? name.slice(0, 58) + '…' : name; }
    out.push(r);
  });
  return out;
}
const KP_URL = (kind, q, srv) => `https://knightpin.com/${kind === 'item' ? 'knight-online-item-pazari' : 'knight-online-char-ring-pazari'}?${new URLSearchParams({ search: q, ...(srv ? { server: srv.toUpperCase() } : {}), mode: 'listings', sort: 'price_low' })}`;
const OE_SRV = { Zero: 3, Agartha: 4, Pandora: 5, Felis: 6, Dryads: 7 };
const OE_URL = (kind, q, srv) => {
  const p = new URLSearchParams({ search: q });
  if (OE_SRV[srv]) p.append('ServerID[]', OE_SRV[srv]);
  return `https://oyuneks.com/knight-online-world/${kind === 'item' ? 'knight-online-item-satis-ilanlari' : 'knight-online-cypher-ring'}?${p}`;
};
const EXE_SITES = [
  { site: 'Knightpin', url: KP_URL, parse: (h, kind) => ilParseMpCards(h, kind, 'Knightpin', 'https://knightpin.com/') },
  { site: 'Oyuneks', url: OE_URL, parse: (h, kind) => { const a = ilParseMpCards(h, kind, 'Oyuneks', 'https://oyuneks.com/'); return a.length ? a : ilParseGeneric(h, kind, 'Oyuneks', 'https://oyuneks.com/', kind === 'item' ? 'knight-online-item-satis-ilanlari/' : 'knight-online-cypher-ring/'); } },
];
async function ilExeSite(s, kind, q, srv) {
  const kw = ilKw(q);
  const r = await (await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.url(kind, kw, srv), render: true, wait: 12000 }) })).json();
  if (!r.ok) throw new Error(r.error || 'okunamadı');
  const m = ilMatcher(q);
  return s.parse(r.html || '', kind).filter(x => (!srv || !x.server || x.server === srv) && m(x));
}

/* ---------- paylaşım (Windows uygulamasının okuduğu siteler) ---------- */
const ilKey = (kind, q, srv) => { const s = `${kind}|${trLow(q).trim()}|${srv}`; let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'ilan-' + kind + '-' + (h >>> 0).toString(36); };
async function ilShare(kind, q, srv, rows) {
  if (!CLOUD.db || !CLOUD.user) return;
  try {
    const json = JSON.stringify({ kind, q, server: srv, rows: rows.slice(0, 300) });
    if (json.length > 900000) return;
    await FB.setDoc(FB.doc(CLOUD.db, 'kohesapMarket', ilKey(kind, q, srv)), { json, count: rows.length, at: Date.now(), time: FB.serverTimestamp(), by: CLOUD.user.uid, app: 'exe ilan' });
  } catch (e) { console.warn('ilan paylaşılamadı', e); }
}
async function ilShared(kind, q, srv) {
  if (!CLOUD.db) return null;
  try {
    const d = await FB.getDoc(FB.doc(CLOUD.db, 'kohesapMarket', ilKey(kind, q, srv)));
    if (!d.exists()) return null;
    const v = d.data(); if (Date.now() - v.at > 12 * 3600e3) return null;
    return { at: v.at, rows: JSON.parse(v.json).rows || [] };
  } catch { return null; }
}

/* ---------- arama ---------- */
let ilSeq = 0;
async function ilSearch() {
  const kind = IL.kind, q = IL.q.trim(), srv = IL.server, seq = ++ilSeq;
  if (kind === 'item' && q.length < 2) { IL.err = 'Item adından en az 2 harf yaz.'; ilPaint(); return; }
  IL.busy = true; IL.err = ''; IL.rows = []; IL.sources = []; IL.shared = null; IL.prog = 'Kopazar ve ByNoGame okunuyor…'; ilPaint();
  const add = (rows, src) => { if (seq !== ilSeq) return; IL.rows.push(...rows); IL.sources = IL.sources.filter(s => s.site !== src.site).concat(src); ilPaint(); };
  const jobs = [];
  jobs.push((async () => {
    try {
      const base = IS_EXE ? siteBase() : '';
      const r = await (await authFetch(`${base}/api/kohesap/ilan?${new URLSearchParams({ kind, q, server: srv })}`)).json();
      if (!r.ok) throw new Error(r.error || 'okunamadı');
      add(r.rows || [], { site: '_srv', ok: true, n: 0 });
      (r.sources || []).forEach(s => add([], s));
    } catch (e) { add([], { site: 'Kopazar', ok: false, n: 0, error: e.message }); add([], { site: 'ByNoGame', ok: false, n: 0, error: e.message }); }
  })());
  if (serverMode) {
    const exeRows = [];
    jobs.push((async () => {
      for (const s of EXE_SITES) {
        if (seq !== ilSeq) return;
        IL.prog = `${s.site} okunuyor (uygulama tarayıcısı)…`; ilPaint();
        try { const rows = await ilExeSite(s, kind, q, srv); exeRows.push(...rows); add(rows, { site: s.site, ok: true, n: rows.length }); }
        catch (e) { add([], { site: s.site, ok: false, n: 0, error: e.message }); }
      }
      if (exeRows.length) ilShare(kind, q, srv, exeRows);
    })());
  } else {
    jobs.push((async () => {
      const sh = await ilShared(kind, q, srv);
      if (sh && seq === ilSeq) {
        IL.shared = sh.at;
        const by = {}; sh.rows.forEach(r => { by[r.site] = (by[r.site] || 0) + 1; });
        add(sh.rows, { site: '_shared', ok: true, n: sh.rows.length });
        Object.entries(by).forEach(([site, n]) => add([], { site, ok: true, n, shared: true }));
      }
      ['Knightpin', 'Oyuneks'].forEach(site => { if (!IL.sources.some(s => s.site === site)) add([], { site, ok: false, n: 0, exeOnly: true }); });
    })());
  }
  await Promise.all(jobs);
  if (seq !== ilSeq) return;
  if (typeof acLearn === 'function') acLearn(IL.rows.filter(r => r.kind === 'item').map(r => r.name));
  IL.busy = false; IL.at = Date.now(); IL.prog = ''; ilPaint();
}
function ilPaint() { if (ui.page === 'ilan') render(); }

/* ---------- görünüm ---------- */
VIEWS.ilan = () => {
  const gbTL = S.settings.gbTL || 0;
  let rows = IL.rows.filter(r => IL.site === 'all' || r.site === IL.site);
  rows = [...rows].sort((a, b) => IL.sort === 'asc' ? a.price - b.price : b.price - a.price);
  const all = IL.rows;
  const srcs = IL.sources.filter(s => !s.site.startsWith('_'));
  const min = all.length ? Math.min(...all.map(r => r.price)) : 0;
  const sorted = all.map(r => r.price).sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const bySrv = {}; all.forEach(r => { const k = r.server || '—'; (bySrv[k] = bySrv[k] || []).push(r.price); });
  const srvStats = Object.entries(bySrv).map(([k, v]) => [k, Math.min(...v), v.length]).sort((a, b) => b[2] - a[2]);
  const priceCell = p => `<b>${fmtTL(p)}</b>${gbTL ? `<div class="hint">${nf2.format(p / gbTL)} GB</div>` : ''}`;
  const chip = s => {
    const n = IL.rows.filter(r => r.site === s.site).length;
    const st = s.exeOnly ? 'yalnız Windows uygulamasında' : !s.ok ? 'okunamadı' : s.shared ? 'uygulamadan' : `${n} ilan`;
    return `<button class="il-chip ${IL.site === s.site ? 'on' : ''} ${s.exeOnly ? 'exe' : s.ok ? '' : 'bad'}" data-act="il-site" data-v="${esc(s.site)}" title="${esc(s.error || '')}"><i style="background:${IL_SITE_COLOR[s.site] || 'var(--tx3)'}"></i>${esc(s.site)}<span>${esc(st)}</span></button>`;
  };
  return `
  <div class="card il-bar">
    <div class="il-row">
      <div class="seg">${[['item', 'Item'], ['char', 'Karakter']].map(([k, l]) => `<button class="${IL.kind === k ? 'on' : ''}" data-act="il-kind" data-v="${k}">${l}</button>`).join('')}</div>
      <select class="inp il-srv" data-ils="1"><option value="">Tüm sunucular</option>${IL_SERVERS.map(s => `<option ${s === IL.server ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="search il-q"><input class="inp" ${IL.kind === 'item' ? 'data-ac="item"' : ''} autocomplete="off" data-fk="ilq" data-ilq="1" value="${esc(IL.q)}" placeholder="${IL.kind === 'item' ? 'Item yaz: raptor, rev shard +7…' : 'Sınıf / özellik (boş = hepsi): priest, 83/10…'}"></label>
      <button class="btn pri" data-act="il-go" ${IL.busy ? 'disabled' : ''}>${ICON.refresh} Ara</button>
    </div>
    ${srcs.length ? `<div class="il-chips"><button class="il-chip ${IL.site === 'all' ? 'on' : ''}" data-act="il-site" data-v="all">Tümü<span>${all.length} ilan</span></button>${srcs.map(chip).join('')}</div>` : ''}
    ${IL.busy ? `<div class="hint gold" style="margin-top:8px">${esc(IL.prog || 'Aranıyor…')}</div>` : ''}
    ${IL.err ? `<div class="callout" style="margin-top:10px">${esc(IL.err)}</div>` : ''}
    ${!serverMode && IL.at && !IL.shared ? `<div class="hint" style="margin-top:8px">Knightpin ve Oyuneks bot koruması yüzünden yalnızca Windows uygulamasında okunur. Uygulamada aynı aramayı yapan ekip üyesinin sonucu buraya da gelir.</div>` : ''}
    ${IL.shared ? `<div class="hint" style="margin-top:8px">Knightpin / Oyuneks sonuçları Windows uygulamasından paylaşıldı (${agoText(Date.now() - IL.shared)}).</div>` : ''}
  </div>
  ${all.length ? `<div class="grid g4" style="margin:14px 0">
    ${stat('En ucuz', fmtTL(min), gbTL ? nf2.format(min / gbTL) + ' GB' : '', 'var(--green)')}
    ${stat('Orta fiyat', fmtTL(med), `${all.length} ilanın ortası`, 'var(--gold)')}
    ${stat('İlan sayısı', fmtN(all.length), `${srcs.filter(s => s.ok).length} site`, 'var(--blue)')}
    ${stat('Sunucular', `<span class="il-srvs">${srvStats.slice(0, 3).map(([k, , n]) => `${esc(k)} <span class="mut">${n}</span>`).join(' · ') || '—'}</span>`, srvStats.length > 3 ? '+' + (srvStats.length - 3) + ' sunucu' : '', 'var(--violet)')}
  </div>` : ''}
  <div class="card" style="padding:0;overflow:hidden;${all.length ? '' : 'margin-top:14px'}">
    ${rows.length ? `<div class="tbl-wrap il-wrap" style="border:0;border-radius:0"><table class="il-tbl">
      <thead><tr><th>İlan</th><th>Sunucu</th><th>Site</th><th class="num sortable" data-act="il-sort">Fiyat ${IL.sort === 'asc' ? '▲' : '▼'}</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 300).map((r, i) => `<tr>
        <td class="il-name"><div class="il-nm">${r.kind === 'item' ? itemIcon(itemIconPath(r.name), r.name, 32) : ''}<div><b>${esc(r.name)}</b>${r.grade === 'Reverse' && !/rev/i.test(r.name) ? ' <span class="badge">Reverse</span>' : ''}${r.np ? ` <span class="badge">NP ${esc(r.np)}</span>` : ''}${r.sub ? `<div class="hint">${esc(r.sub)}</div>` : ''}</div></div></td>
        <td><span class="badge">${esc(r.server || '—')}</span></td>
        <td><span class="il-site"><i style="background:${IL_SITE_COLOR[r.site] || 'var(--tx3)'}"></i>${esc(r.site)}</span></td>
        <td class="num">${priceCell(r.price)}</td>
        <td class="il-act"><a class="btn sm ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Aç ↗</a>${r.kind === 'item' ? `<button class="icon-btn" title="Fiyat listeme ekle" data-act="il-toprice" data-i="${i}">${ICON.plus}</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>${rows.length > 300 ? `<div class="hint" style="padding:10px">İlk 300 ilan gösteriliyor.</div>` : ''}`
      : `<div style="padding:18px">${IL.busy ? empty('Aranıyor…', 'Siteler okunuyor.') : IL.at ? empty('İlan bulunamadı', 'Başka bir yazım dene (ör. sadece “raptor”) ya da sunucuyu “Tüm sunucular” yap.') : empty('Ne arıyorsun?', `${IL.kind === 'item' ? 'Item adından 2 harf yaz, listeden seç ve <b>Ara</b>.' : 'Sunucuyu seç ve <b>Ara</b>. Sınıf ya da özellik yazarak daraltabilirsin.'} Kopazar, ByNoGame${serverMode ? ', Knightpin ve Oyuneks' : ''} birlikte taranır.`)}</div>`}
  </div>`;
};
const ilRowsView = () => [...IL.rows.filter(r => IL.site === 'all' || r.site === IL.site)].sort((a, b) => IL.sort === 'asc' ? a.price - b.price : b.price - a.price);
Object.assign(ACTIONS, {
  'il-go': () => ilSearch(),
  'il-kind': el => { if (IL.kind === el.dataset.v) return; IL.kind = el.dataset.v; IL.q = ''; IL.rows = []; IL.sources = []; IL.at = 0; IL.site = 'all'; ilSave(); render(); if (IL.kind === 'char') ilSearch(); },
  'il-site': el => { IL.site = el.dataset.v; render(); },
  'il-sort': () => { IL.sort = IL.sort === 'asc' ? 'desc' : 'asc'; render(); },
  'il-toprice': el => {
    const r = ilRowsView()[+el.dataset.i]; if (!r) return;
    const noah = noahOfTL(r.price);
    if (noah == null) { toast('Önce GB fiyatını gir (TL → noah çevirmek için).', 'err'); return; }
    let p = S.prices.find(x => trLow(x.name) === trLow(r.name));
    if (!p) { p = { id: uid(), name: r.name, cat: 'Site ilanı', price: 0, updated: localDate(), hist: [] }; S.prices.push(p); }
    setPrice(p, noah, r.site.toLowerCase()); save(); toast(`${r.name}: ${fmtTL(r.price)} ≈ ${fmtShort(noah)} noah fiyat listene eklendi`, 'ok');
  },
});
document.addEventListener('input', e => { if (e.target.dataset.ilq) IL.q = e.target.value; });
document.addEventListener('change', e => { if (e.target.dataset.ils) { IL.server = e.target.value; ilSave(); if (IL.at) ilSearch(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.ilq && !(typeof AC !== 'undefined' && AC.pop && AC.idx >= 0)) { e.preventDefault(); ilSearch(); } });
document.addEventListener('ac-pick', e => { if (e.target.dataset.ilq) ilSearch(); });
