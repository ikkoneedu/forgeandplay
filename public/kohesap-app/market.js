'use strict';
/* ==========================================================================
   CANLI PAZAR — veri adresi (API) keşfi, sunucu seçimi, tüm sayfaları çekme
   1) Sayfa gizli tarayıcıda açılır, sitenin arka planda çektiği JSON yakalanır.
   2) İçinde ilan listesi olan JSON bulunur; adresindeki sayfa / sunucu / adet
      parametreleri tespit edilir.
   3) Sayfa parametresi artırılarak bütün ilanlar çekilir (önce doğrudan,
      olmazsa sitenin içinden). API yoksa HTML tablo/kart okumaya düşülür.
   ========================================================================== */

const MK = {
  items: [], cols: [], source: '', time: '', err: '', busy: false, progress: '',
  page: 1, per: 50, q: '', server: 'all', sort: null, prevSig: null, newSig: new Set(), pages: 0, total: null,
};
ui.mk = MK;

const PAGE_KEYS = ['page', 'p', 'sayfa', 'pagenumber', 'pageindex', 'currentpage', 'pg', 'pageno'];
const OFFSET_KEYS = ['offset', 'skip', 'start', 'from'];
const LIMIT_KEYS = ['limit', 'take', 'per_page', 'perpage', 'pagesize', 'page_size', 'size', 'count', 'adet', 'per'];
const SERVER_KEYS = ['server', 'sunucu', 'servername', 'server_name', 'serverid', 'server_id', 'sv', 'srv', 'world'];
const TOTAL_KEYS = ['total', 'totalcount', 'total_count', 'totalitems', 'total_items', 'totalrecords', 'recordstotal', 'count', 'toplam'];
const TOTALPAGE_KEYS = ['totalpages', 'total_pages', 'pagecount', 'page_count', 'last_page', 'lastpage', 'pages', 'maxpage'];
const lk = k => String(k).toLowerCase();

/* ---------- JSON analizi ---------- */
function findArrays(node, path = [], out = [], depth = 0) {
  if (depth > 6 || node == null) return out;
  if (Array.isArray(node)) {
    if (node.length && node.filter(x => x && typeof x === 'object' && !Array.isArray(x)).length >= Math.max(1, node.length * 0.8)) out.push({ path, arr: node });
    node.slice(0, 3).forEach((x, i) => findArrays(x, path.concat(i), out, depth + 1));
  } else if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) findArrays(v, path.concat(k), out, depth + 1);
  }
  return out;
}
const atPath = (o, path) => path.reduce((a, k) => a == null ? a : a[k], o);
function flatObj(o, pre = '', out = {}, depth = 0) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = pre ? pre + '.' + k : k;
    if (v == null) out[key] = '';
    else if (typeof v === 'object' && !Array.isArray(v)) { if (depth < 2) flatObj(v, key, out, depth + 1); }
    else if (Array.isArray(v)) { if (v.length && v.every(x => typeof x !== 'object')) out[key] = v.join(', '); }
    else out[key] = v;
  }
  return out;
}
const HINT_RE = /price|fiyat|tutar|amount|ucret|item|name|isim|ad$|urun|title|server|sunucu|seller|satici|nick|user|adet|qty|quantity|stack|date|tarih|time/i;
function scoreList(arr) {
  const keys = Object.keys(flatObj(arr[0] || {}));
  const hints = keys.filter(k => HINT_RE.test(k)).length;
  return arr.length * (1 + hints) * (keys.length >= 2 ? 1 : 0.1);
}
const CHAT_RE = /content|message|mesaj|text|badge|room|chat|avatar|emoji|reply|like/i;
// refs: sayfadaki ilan tablosundan örnek hücre metinleri (item adları, satıcılar…)
function pickListing(reqs, refs) {
  let best = null;
  const low = (refs || []).map(r => trLow(r)).filter(r => r.length >= 3);
  for (const r of reqs || []) {
    if (!r.body) continue;
    let j; try { j = JSON.parse(r.body); } catch { continue; }
    for (const c of findArrays(j)) {
      const keys = Object.keys(flatObj(c.arr[0] || {}));
      let sc = scoreList(c.arr);
      const chatty = keys.filter(k => CHAT_RE.test(k)).length;
      if (low.length) {
        const blob = trLow(JSON.stringify(c.arr));
        const hits = low.filter(x => blob.includes(x)).length;
        if (hits < Math.min(3, low.length)) continue; // tablodaki ilanları içermiyorsa ilan listesi değildir
        sc *= 1 + hits;
      } else if (chatty) sc /= (1 + chatty * 3);
      if (!best || sc > best.score) best = { score: sc, url: r.url, method: r.method || 'GET', path: c.path, items: c.arr, root: j };
    }
  }
  return best && (low.length || best.score >= 6) ? best : null;
}
// sayfadaki en büyük ilan tablosu
function listingTable(html) {
  const p = parseAnyTables(html);
  const t = p.tables.filter(t => t.head.length >= 3).sort((a, b) => b.rows.length - a.rows.length)[0];
  return t || parseCards(parseDoc(html));
}
function tableRefs(t) {
  if (!t) return [];
  const out = [];
  t.rows.slice(0, 12).forEach(r => r.forEach(c => { const v = String(c).trim(); if (v.length >= 4 && v.length <= 60 && !/^[\d\s.,:/-]+$/.test(v)) out.push(v); }));
  return [...new Set(out)].slice(0, 30);
}
function findNumKey(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3 || Array.isArray(obj)) return null;
  for (const [k, v] of Object.entries(obj)) if (keys.includes(lk(k)) && typeof v === 'number') return v;
  for (const v of Object.values(obj)) { const r = findNumKey(v, keys, depth + 1); if (r != null) return r; }
  return null;
}
function analyzeApi(best) {
  const u = new URL(best.url);
  const params = [...u.searchParams.keys()];
  const find = keys => params.find(p => keys.includes(lk(p)));
  const cfg = {
    url: best.url, method: best.method, path: best.path,
    pageParam: find(PAGE_KEYS) || null, offsetParam: find(OFFSET_KEYS) || null, limitParam: find(LIMIT_KEYS) || null,
    serverParam: find(SERVER_KEYS) || null, firstCount: best.items.length,
    found: new Date().toLocaleString('tr-TR'), v: 2,
  };
  // sunucu parametresi adından anlaşılmıyorsa: değeri bilinen bir sunucu adı olan parametre
  if (!cfg.serverParam) {
    const servers = knownServers().map(foldSrv);
    cfg.serverParam = params.find(p => servers.includes(foldSrv(u.searchParams.get(p)))) || null;
  }
  // sayfa adresi yolunda olabilir: /page/1, /sayfa/1
  if (!cfg.pageParam && !cfg.offsetParam) {
    const m = u.pathname.match(/\/(page|sayfa|p)\/(\d+)/i);
    if (m) cfg.pathPage = m[1];
  }
  return cfg;
}
const srvBase = foldSrv;
const knownServers = () => [...new Set([...(S.gbMarket ? S.gbMarket.servers : []), ...DEFAULT_SERVERS])];

function buildPageUrl(cfg, n, server, firstLen) {
  const u = new URL(cfg.url);
  if (cfg.pageParam) {
    const base = parseInt(new URL(cfg.url).searchParams.get(cfg.pageParam), 10);
    const zeroBased = base === 0;
    u.searchParams.set(cfg.pageParam, String(zeroBased ? n - 1 : n));
  } else if (cfg.offsetParam) {
    u.searchParams.set(cfg.offsetParam, String((n - 1) * (firstLen || cfg.firstCount || 40)));
  } else if (cfg.pathPage) {
    u.pathname = u.pathname.replace(new RegExp('/(' + cfg.pathPage + ')/\\d+', 'i'), '/$1/' + n);
  } else if (n > 1) {
    u.searchParams.set('page', String(n));
  }
  if (cfg.serverParam && server && server !== 'all') {
    const orig = new URL(cfg.url).searchParams.get(cfg.serverParam) || '';
    const val = /^[A-Z]+$/.test(orig) ? server.toUpperCase() : /^[a-z]+$/.test(orig) ? trLow(server) : server;
    if (!/^\d+$/.test(orig)) u.searchParams.set(cfg.serverParam, val);
  }
  return u.toString();
}

/* ---------- veri getirme ---------- */
async function apiGet(cfg, urls) {
  // 1) doğrudan (hızlı) — 2) sitenin içinden (çerez / köken gerekiyorsa)
  const out = [];
  if (cfg.via !== 'browser') {
    let okAll = true;
    for (const url of urls) {
      try {
        const d = await rawFetch(url, false);
        const j = d.ok && d.html ? JSON.parse(d.html) : null;
        if (!j) { okAll = false; break; }
        out.push(j);
      } catch { okAll = false; break; }
    }
    if (okAll) { cfg.via = 'direct'; return out; }
    out.length = 0;
  }
  const r = await fetch('/api/browserfetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: S.settings.marketUrl, urls }) }).then(x => x.json());
  if (!r.ok) throw new Error(r.error || 'site içinden çekilemedi');
  for (const x of r.results) {
    if (x.error || x.status >= 400) throw new Error(`${x.status || ''} ${x.error || 'sayfa alınamadı'}`.trim());
    out.push(JSON.parse(x.text));
  }
  cfg.via = 'browser';
  return out;
}
const sigOf = o => JSON.stringify(o).slice(0, 400);

async function discover() {
  if (!serverMode) throw new Error('WEB_NO_API');
  MK.progress = 'Sayfa gizli tarayıcıda açılıyor…'; paintMk();
  const urls = withTest(S.settings.marketUrl);
  let lastErr = '';
  for (const url of urls) {
    try {
      const d = await rawFetch(url, true);
      if (!d.ok) { lastErr = d.error || 'açılamadı'; continue; }
      const table = listingTable(d.html);
      const best = pickListing(d.requests, tableRefs(table));
      if (best) {
        const cfg = analyzeApi(best);
        S.settings.marketApi = cfg; save();
        return { cfg, first: atPath(best.root, best.path), root: best.root };
      }
      if (table) { S.settings.marketApi = { mode: 'html', url, v: 2 }; save(); return { html: true, url }; }
      lastErr = 'sayfada ilan listesi bulunamadı';
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}
// Tablo modu: gizli tarayıcı sitenin "sonraki sayfa" düğmesine basarak tüm sayfaları okur
async function loadHtmlPages(url) {
  const maxPages = Math.max(1, S.settings.marketMaxPages || 30);
  MK.progress = `Sayfalar okunuyor (en fazla ${maxPages})… bu biraz sürebilir`; paintMk();
  const r = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, pages: maxPages }) }).then(x => x.json());
  if (!r.ok) throw new Error(r.error || 'sayfalar okunamadı');
  let head = null; const rows = []; const seen = new Set();
  for (const html of r.pages) {
    const t = listingTable('<html><body>' + html + '</body></html>');
    if (!t) continue;
    if (!head) head = t.head;
    for (const row of t.rows) { const k = row.join('|'); if (!seen.has(k)) { seen.add(k); rows.push(row); } }
  }
  if (!head) throw new Error('sayfada ilan tablosu bulunamadı');
  MK.siteCols = head.map((h, i) => h || 'Alan ' + (i + 1));
  MK.items = rows.map(row => Object.fromEntries(MK.siteCols.map((h, i) => [h, row[i] || ''])));
  return r.pages.length;
}
async function loadMarket(opts = {}) {
  if (!serverMode) { subscribeWebMarket(); return; }
  if (MK.busy) return; MK.busy = true; MK.err = '';
  const maxPages = Math.max(1, S.settings.marketMaxPages || 30);
  try {
    let cfg = opts.rediscover ? null : S.settings.marketApi;
    if (cfg && cfg.v !== 2) cfg = null; // eski sürümün (hatalı seçilmiş olabilecek) kaydı
    if (cfg && cfg.mode === 'html') {
      if (!serverMode) throw new Error('WEB_NO_API');
      const n = await loadHtmlPages(cfg.url || S.settings.marketUrl);
      MK.total = null; finishLoad('html', n, null); return;
    }
    if (cfg && cfg.serverParam && MK.server === 'all') MK.server = S.settings.server || knownServers()[0];
    let items = [], pages = 0, total = null;
    if (cfg) {
      // kayıtlı API ile doğrudan başla
      try {
        MK.progress = 'Sayfa 1 çekiliyor…'; paintMk();
        const [j] = await apiGet(cfg, [buildPageUrl(cfg, 1, MK.server)]);
        const first = atPath(j, cfg.path);
        if (!Array.isArray(first)) throw new Error('veri yapısı değişmiş');
        items = first.slice(); pages = 1;
        total = findNumKey(j, TOTAL_KEYS); MK.totalPages = findNumKey(j, TOTALPAGE_KEYS);
      } catch (e) { cfg = null; }
    }
    if (!cfg) {
      const r = await discover();
      if (r.html) { const n = await loadHtmlPages(r.url); finishLoad('html', n, null); return; }
      cfg = r.cfg; items = r.first.slice(); pages = 1;
      total = findNumKey(r.root, TOTAL_KEYS); MK.totalPages = findNumKey(r.root, TOTALPAGE_KEYS);
      // sunucu parametresi varsa karakterin sunucusuyla başla
      if (cfg.serverParam && MK.server === 'all') MK.server = S.settings.server || knownServers()[0];
      if (MK.server !== 'all' && cfg.serverParam) {
        const [j] = await apiGet(cfg, [buildPageUrl(cfg, 1, MK.server)]);
        items = (atPath(j, cfg.path) || []).slice();
      }
    }
    // kalan sayfalar
    const firstLen = items.length;
    let lastSig = items.length ? sigOf(items[0]) : '';
    const tp = MK.totalPages && MK.totalPages > 1 ? Math.min(MK.totalPages, maxPages) : null;
    for (let n = 2; n <= (tp || maxPages); n++) {
      if (!firstLen) break;
      if (total != null && items.length >= total) break;
      MK.progress = `Sayfa ${n}${tp ? ' / ' + tp : ''} çekiliyor… (${items.length} ilan)`; paintMk();
      let arr;
      try {
        const [j] = await apiGet(cfg, [buildPageUrl(cfg, n, MK.server, firstLen)]);
        arr = atPath(j, cfg.path);
      } catch (e) { break; }
      if (!Array.isArray(arr) || !arr.length) break;
      const sig = sigOf(arr[0]);
      if (sig === lastSig) break; // site sayfa parametresini dikkate almıyor
      lastSig = sig; items.push(...arr); pages = n;
      if (arr.length < firstLen && !tp) break;
      await new Promise(r => setTimeout(r, 250));
    }
    MK.items = items.map(o => flatObj(o));
    MK.total = total;
    finishLoad('api', pages, cfg);
  } catch (e) {
    MK.err = e.message;
  } finally {
    MK.busy = false; MK.progress = '';
    ui.marketNext = Date.now() + S.settings.marketRefreshSec * 1000;
    if (ui.page === 'pazar') render();
  }
}
function finishLoad(source, pages, cfg) {
  const sigs = new Set(MK.items.map(o => JSON.stringify(o)));
  MK.newSig = MK.prevSig ? new Set([...sigs].filter(s => !MK.prevSig.has(s))) : new Set();
  MK.prevSig = sigs;
  MK.source = source; MK.pages = pages; MK.cfg = cfg;
  // Liste sitenin tablosundan okunduysa: sitenin sütunları, sırası ve başlıkları aynen
  const siteCols = source === 'html' ? MK.siteCols : source === 'shared' ? MK.sharedCols : null;
  MK.rawLabels = !!(siteCols && (source === 'html' || MK.sharedSource === 'html'));
  MK.cols = siteCols && siteCols.length ? siteCols.filter(c => MK.items.some(o => String(o[c] ?? '').trim() !== '')) : chooseCols(MK.items);
  MK.serverCol = detectServerCol(MK.items, MK.cols);
  MK.time = new Date().toLocaleTimeString('tr-TR');
  if (MK.page > Math.ceil(filtered().length / MK.per)) MK.page = 1;
  if (source !== 'shared') publishMarket().catch(e => console.warn('pazar paylaşılamadı', e));
}

/* ---------- web ile paylaşım ----------
   Windows uygulaması pazarı her okuduğunda (en fazla 2 dk'da bir) sonucu
   kohesapMarket/latest belgesine yazar; web sürümü bu belgeyi canlı dinler. */
let mkLastPublish = 0, mkUnsub = null;
async function publishMarket() {
  if (!serverMode || typeof CLOUD === 'undefined' || !CLOUD.user || !CLOUD.db || !MK.items.length) return;
  if (MK.cfg && MK.cfg.serverParam) return; // tek sunucuya göre çekilmiş liste: tüm pazar değil
  if (Date.now() - mkLastPublish < 120000) return;
  const cols = MK.cols;
  let rows = MK.items.map(o => cols.map(c => o[c] ?? ''));
  let json = JSON.stringify({ cols, rows, pages: MK.pages, source: MK.source });
  while (json.length > 900000 && rows.length > 100) { rows = rows.slice(0, Math.floor(rows.length * 0.8)); json = JSON.stringify({ cols, rows, pages: MK.pages, source: MK.source }); }
  await FB.setDoc(FB.doc(CLOUD.db, 'kohesapMarket', 'latest'), { json, count: rows.length, at: Date.now(), time: FB.serverTimestamp(), by: CLOUD.user.uid, app: 'exe ' + ($('#ver').textContent || '') });
  mkLastPublish = Date.now();
}
function subscribeWebMarket() {
  if (mkUnsub || typeof CLOUD === 'undefined' || !CLOUD.db) return;
  MK.busy = true; MK.progress = 'Paylaşılan pazar verisi alınıyor…';
  mkUnsub = FB.onSnapshot(FB.doc(CLOUD.db, 'kohesapMarket', 'latest'), snap => {
    MK.busy = false; MK.progress = '';
    if (!snap.exists()) { MK.err = 'WEB_NO_DATA'; if (ui.page === 'pazar') render(); return; }
    try {
      const d = snap.data(), p = JSON.parse(d.json);
      MK.items = p.rows.map(r => Object.fromEntries(p.cols.map((c, i) => [c, r[i]])));
      MK.sharedCols = p.cols; MK.sharedSource = p.source;
      MK.webAt = d.at || 0; MK.err = '';
      finishLoad('shared', p.pages || 1, null);
      MK.time = new Date(MK.webAt).toLocaleTimeString('tr-TR');
    } catch (e) { MK.err = 'Paylaşılan pazar verisi okunamadı'; }
    if (ui.page === 'pazar') render();
  }, err => { MK.busy = false; MK.err = 'Paylaşılan pazar okunamadı: ' + err.message; mkUnsub = null; if (ui.page === 'pazar') render(); });
}
const agoText = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'az önce' : m < 60 ? m + ' dk önce' : Math.round(m / 60) + ' sa önce'; };
refreshMarket = (quiet) => loadMarket({});

/* ---------- sütunlar ---------- */
const COL_ORDER = [/item|isim|name|urun|title|ad$/i, /server|sunucu/i, /price|fiyat|tutar|amount|ucret/i, /adet|qty|quantity|count|stack/i, /seller|satici|nick|user|owner/i, /type|tur|kategori|category/i, /date|tarih|time|created|updated/i];
function chooseCols(items) {
  const keys = {};
  items.slice(0, 200).forEach(o => Object.entries(o).forEach(([k, v]) => {
    const s = String(v ?? '');
    if (!keys[k]) keys[k] = { n: 0, long: 0, url: 0 };
    if (s !== '') keys[k].n++;
    if (s.length > 80) keys[k].long++;
    if (/^https?:\/\/|\.(png|jpe?g|webp|gif|svg)$/i.test(s)) keys[k].url++;
  }));
  const n = Math.min(items.length, 200) || 1;
  let cols = Object.entries(keys).filter(([k, s]) => s.n > n * 0.3 && s.long < n * 0.5 && s.url < n * 0.5 && !/^(_?id|uuid|guid)$|password|token|hash/i.test(k)).map(([k]) => k);
  const rank = k => { const i = COL_ORDER.findIndex(re => re.test(k)); return i < 0 ? 99 : i; };
  cols.sort((a, b) => rank(a) - rank(b));
  return cols.slice(0, 9);
}
function detectServerCol(items, cols) {
  const servers = new Set(knownServers().map(srvBase));
  let best = null, bestHits = 0;
  for (const c of cols) {
    const hits = items.slice(0, 300).filter(o => servers.has(srvBase(o[c]))).length;
    if (hits > bestHits) { best = c; bestHits = hits; }
  }
  return bestHits >= Math.min(items.length, 300) * 0.5 ? best : null;
}
const colLabel = k => MK.rawLabels ? k : colLabelAuto(k);
const colLabelAuto = k => {
  const last = k.split('.').pop();
  const map = { name: 'İsim', itemname: 'Item', item: 'Item', item_name: 'Item', price: 'Fiyat', fiyat: 'Fiyat', server: 'Sunucu', servername: 'Sunucu', sunucu: 'Sunucu', seller: 'Satıcı', nick: 'Satıcı', quantity: 'Adet', qty: 'Adet', count: 'Adet', date: 'Tarih', created_at: 'Tarih', createdat: 'Tarih', updated_at: 'Güncelleme', type: 'Tür' };
  return map[lk(last)] || last.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
};
const priceCol = () => MK.cols.find(c => /price|fiyat|tutar|amount|ucret/i.test(c));
const nameCol = () => MK.cols.find(c => /item|isim|name|urun|title/i.test(c)) || MK.cols[0];
function fmtCell(k, v) {
  if (v === '' || v == null) return '<span class="mut">—</span>';
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? fmtN(v) : fmtX(v);
  const s = String(v);
  const gb = s.match(/^([\d.,]+)\s*([\d.,]+\s*GB)$/i);
  if (gb) return `<span class="num">${esc(gb[1])}</span> <small class="mut">${esc(gb[2])}</small>`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); if (!isNaN(d)) return esc(d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })); }
  return esc(s);
}
const cellNum = v => { if (typeof v === 'number') return v; const m = String(v).match(/[\d][\d.,]*\s*[kmb]?(?![a-z])/i); return m ? parseAmt(m[0].replace(/\s/g, '')) : 0; };

/* ---------- süzme / sıralama ---------- */
function filtered() {
  let list = MK.items;
  if (MK.server !== 'all' && MK.serverCol && !(MK.cfg && MK.cfg.serverParam)) list = list.filter(o => srvBase(o[MK.serverCol]) === srvBase(MK.server));
  if (MK.q) { const q = trLow(MK.q); list = list.filter(o => trLow(MK.cols.map(c => o[c]).join(' ')).includes(q)); }
  if (MK.sort) {
    const { col, dir } = MK.sort;
    const num = MK.items.slice(0, 50).every(o => o[col] === '' || typeof o[col] === 'number' || /^[\d.,\s]+[kmb]?$/i.test(String(o[col])));
    list = list.slice().sort((a, b) => {
      const x = num ? cellNum(a[col]) : trLow(a[col]), y = num ? cellNum(b[col]) : trLow(b[col]);
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }
  return list;
}

/* ---------- görünüm ---------- */
function paintMk() {
  if (ui.page !== 'pazar') return;
  const el = document.querySelector('[data-mkprog]');
  if (el) el.textContent = MK.progress; else render();
}
VIEWS.pazar = () => {
  if (!MK.items.length && !MK.busy && !MK.err) setTimeout(() => loadMarket({}), 0);
  const servers = MK.cfg && MK.cfg.serverParam ? knownServers() : MK.serverCol ? [...new Set(MK.items.map(o => titleCase(srvBase(o[MK.serverCol]))).filter(Boolean))].sort() : [];
  const list = filtered();
  const pagesN = Math.max(1, Math.ceil(list.length / MK.per));
  MK.page = clamp(MK.page, 1, pagesN);
  const rows = list.slice((MK.page - 1) * MK.per, MK.page * MK.per);
  const pc = priceCol(), nc = nameCol();
  const head = `<div class="row" style="margin-bottom:14px">
    <label class="f" style="flex-direction:row;align-items:center;gap:8px">Sunucu
      <select class="inp" style="width:auto" data-mkserver="1">${MK.cfg && MK.cfg.serverParam ? '' : '<option value="all">Tümü</option>'}${servers.map(s => `<option ${s === MK.server ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="search" style="width:280px"><input class="inp" placeholder="Item veya satıcı ara" data-fk="mkq" data-mkq="1" value="${esc(MK.q)}"></label>
    ${serverMode ? `<label class="check"><input type="checkbox" data-mauto="1" ${ui.marketAuto !== false ? 'checked' : ''}> ${S.settings.marketRefreshSec} sn'de bir yenile</label>
    <span class="mut" data-mcd></span>` : `<span class="badge g">canlı</span><span class="mut">${MK.webAt ? 'Windows uygulamasından ' + agoText(Date.now() - MK.webAt) + ' paylaşıldı' : ''}</span>`}
    <div class="spacer"></div>
    <span class="gold" data-mkprog>${esc(MK.progress)}</span>
    ${serverMode ? `<button class="btn" data-act="mk-rediscover" title="Sitenin veri adresini yeniden bul">${ICON.refresh} Yeniden keşfet</button>
    <button class="btn pri" data-act="mk-refresh" ${MK.busy ? 'disabled' : ''}>${ICON.refresh} Yenile</button>` : ''}
  </div>`;
  if (!MK.items.length) {
    if (MK.err === 'WEB_NO_DATA') return head + `<div class="card">${empty('Henüz paylaşılmış pazar verisi yok', 'Canlı pazar, Windows uygulamasında Canlı Pazar sayfası açıldığında okunup buraya otomatik paylaşılır. Uygulamayı açan ilk kişiyle birlikte bu sayfa da canlı güncellenir.<br><br><a class="btn pri" href="/downloads/KOHesap.exe" download>' + ICON.dl + ' Windows uygulamasını indir</a>')}</div>`;
    if (MK.err === 'WEB_NO_API') return head + `<div class="card">${empty('Canlı pazar Windows uygulamasında', 'Canlı pazar sayfası sitenin içinde tarayıcıyla açılıp okunduğu için şimdilik yalnızca Windows uygulamasında çalışıyor. Uygulama aynı Google hesabıyla senkron çalışır.<br><br><a class="btn pri" href="/downloads/KOHesap.exe" download>' + ICON.dl + ' Windows uygulamasını indir</a>')}</div>`;
    return head + `<div class="card">${MK.err ? errBox('Pazar verisi alınamadı', MK.err, S.settings.marketUrl)
      : empty(MK.busy ? 'Yükleniyor…' : 'Veri yok', esc(MK.progress || 'Canlı pazar çekiliyor. İlk seferde gizli tarayıcı açıldığı için 10–20 sn sürebilir.'))}</div>`;
  }
  const pager = () => {
    const btn = (p, l, dis, on) => `<button class="btn sm ${on ? 'pri' : 'ghost'}" data-act="mk-page" data-p="${p}" ${dis ? 'disabled' : ''}>${l}</button>`;
    const nums = [];
    for (let p = 1; p <= pagesN; p++) if (p === 1 || p === pagesN || Math.abs(p - MK.page) <= 2) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<div class="row" style="justify-content:center;gap:4px;padding:12px">${btn(1, '«', MK.page === 1)}${btn(MK.page - 1, '‹', MK.page === 1)}${nums.map(p => p === '…' ? '<span class="mut">…</span>' : btn(p, p, false, p === MK.page)).join('')}${btn(MK.page + 1, '›', MK.page === pagesN)}${btn(pagesN, '»', MK.page === pagesN)}
      <span class="mut" style="margin-left:10px">Sayfada</span><select class="inp" style="width:auto;padding:4px 8px" data-mkper="1">${[25, 50, 100, 200].map(n => `<option ${n === MK.per ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  };
  return head + `
  <div class="mk-mini">${fmtN(list.length)} ilan · ${fmtN(MK.pages || 1)} site sayfası · ${esc(MK.time)}${MK.newSig.size ? ` · <span class="pos">${MK.newSig.size} yeni</span>` : ''}</div>
  <div class="grid g4 mk-stats" style="margin-bottom:14px">
    ${stat('Toplam ilan', fmtN(list.length), MK.server !== 'all' ? esc(MK.server) + ' sunucusu' : 'tüm sunucular', 'var(--gold)')}
    ${stat('Çekilen site sayfası', fmtN(MK.pages || 1), MK.source === 'shared' ? 'Windows uygulamasından paylaşıldı' : MK.source === 'api' ? (MK.cfg && MK.cfg.via === 'browser' ? 'veri adresi · site içinden' : 'veri adresi · doğrudan') : 'sitenin sayfaları tek tek gezildi', 'var(--blue)')}
    ${stat('Yeni ilan', fmtN(MK.newSig.size), 'son yenilemeden beri', 'var(--green)')}
    ${stat('Son güncelleme', esc(MK.time), MK.err ? '<span class="neg">son deneme başarısız</span>' : (serverMode ? 'otomatik yenileme ' + (ui.marketAuto !== false ? 'açık' : 'kapalı') : 'yeni veri gelince kendiliğinden yenilenir'), 'var(--violet)')}
  </div>
  ${!serverMode && MK.webAt && Date.now() - MK.webAt > 30 * 60000 ? `<div class="callout y" style="margin-bottom:12px">Bu liste ${agoText(Date.now() - MK.webAt)} güncellendi; şu an Windows uygulamasında pazarı açık tutan kimse yok. Güncel liste için uygulamayı açabilirsin.</div>` : ''}
  ${MK.err && MK.err !== 'WEB_NO_API' ? `<div class="callout" style="margin-bottom:12px"><span class="neg">Son yenileme başarısız:</span> ${esc(MK.err)} — gösterilen veriler ${esc(MK.time)} tarihli.</div>` : ''}
  <div class="card" style="padding:0;overflow:hidden">
    <div class="tbl-wrap" style="border:0;border-radius:0;max-height:calc(100vh - 360px)"><table>
      <thead><tr>${MK.cols.map(c => `<th class="sortable ${MK.items.slice(0, 20).every(o => typeof o[c] === 'number' || o[c] === '') ? 'num' : ''}" data-act="mk-sort" data-c="${esc(c)}">${esc(colLabel(c))}${MK.sort && MK.sort.col === c ? (MK.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map(o => { const isNew = MK.newSig.has(JSON.stringify(o)); return `<tr ${isNew ? 'class="row-new"' : ''}>${MK.cols.map(c => `<td class="${typeof o[c] === 'number' ? 'num' : ''}">${c === nc ? '<b>' + fmtCell(c, o[c]) + '</b>' : fmtCell(c, o[c])}</td>`).join('')}
        <td style="white-space:nowrap">${isNew ? '<span class="badge g">yeni</span> ' : ''}${pc && nc ? `<button class="icon-btn" title="Fiyat listeme ekle" data-act="mk-toprice" data-i="${MK.items.indexOf(o)}">${ICON.plus}</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="${MK.cols.length + 1}">${empty('Sonuç yok')}</td></tr>`}</tbody>
    </table></div>
    ${pager()}
  </div>
  <div class="hint" style="margin-top:8px">Kaynak: ${esc(S.settings.marketUrl)}${MK.cfg ? ` · veri adresi: <span class="mono">${esc(new URL(MK.cfg.url).pathname)}</span>${MK.cfg.pageParam || MK.cfg.offsetParam || MK.cfg.pathPage ? ' · sayfalama: ' + esc(MK.cfg.pageParam || MK.cfg.offsetParam || MK.cfg.pathPage) : ''}${MK.cfg.serverParam ? ' · sunucu parametresi: ' + esc(MK.cfg.serverParam) : ''}` : ''} · en fazla ${S.settings.marketMaxPages || 30} site sayfası çekilir (Ayarlar).</div>`;
};

Object.assign(ACTIONS, {
  'mk-refresh': () => loadMarket({}),
  'mk-rediscover': () => { S.settings.marketApi = null; save(); loadMarket({ rediscover: true }); },
  'mk-page': el => { MK.page = +el.dataset.p; render(); const w = document.querySelector('.content .tbl-wrap'); if (w) w.scrollTop = 0; },
  'mk-sort': el => { const c = el.dataset.c; MK.sort = MK.sort && MK.sort.col === c ? (MK.sort.dir > 0 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 }; render(); },
  'mk-toprice': el => {
    const o = MK.items[+el.dataset.i], name = String(o[nameCol()] || '').trim(), price = cellNum(o[priceCol()]);
    if (!name) return;
    let p = S.prices.find(x => trLow(x.name) === trLow(name));
    if (!p) { p = { id: uid(), name, cat: 'Pazardan', price: 0, updated: localDate(), hist: [] }; S.prices.push(p); }
    setPrice(p, Math.round(price), 'pazar'); save(); toast(`${name} fiyat listene eklendi (${fmtShort(price)})`, 'ok');
  },
});
document.addEventListener('input', e => {
  if (e.target.dataset.mkq) { MK.q = e.target.value; MK.page = 1; render(); }
});
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.mkserver) {
    MK.server = e.target.value; MK.page = 1;
    if (MK.cfg && MK.cfg.serverParam) loadMarket({}); else render();
  } else if (d.mkper) { MK.per = +e.target.value; MK.page = 1; render(); }
});
