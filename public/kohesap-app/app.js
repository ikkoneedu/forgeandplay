'use strict';
/* ==========================================================================
   KO Hesap — arayüz ve hesaplama mantığı
   Tüm para değerleri (aksi belirtilmedikçe) NOAH cinsinden saklanır.
   ========================================================================== */

/* ---------- küçük yardımcılar ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const localDate = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthName = ym => { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const shortMonth = ym => MONTHS[+ym.split('-')[1] - 1].slice(0, 3);
const addMonth = (ym, d) => { let [y, m] = ym.split('-').map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + pad(m); };
const fmtDate = d => d ? d.split('-').reverse().join('.') : '—';

/* ---------- varsayılan veri ---------- */
function defaultState() {
  return {
    v: 1,
    settings: {
      charName: '', server: '',
      gbNoah: 100000000,       // 1 Gold Bar = kaç noah
      gbTL: 0,                 // 1 GB kaç TL
      kcPackTL: 0, kcPackKC: 400, // KC paketi: X TL'ye Y KC
      usdTL: 0, eurTL: 0, ratesTime: '', gbTime: '',
      autoRates: true, autoSources: false,
      gbUrl: 'https://www.enucuzgb.com/', gbUrl2: 'https://test.enucuzgb.com/',
      marketUrl: 'https://www.enucuzgb.com/canlipazar', eventsUrl: 'https://www.enucuzgb.com/knight-online/events',
      gbAuto: true, gbPick: 'minSell', gbRefreshMin: 10, marketRefreshSec: 60, marketMaxPages: 30, marketApi: null, eventNotify: true, eventNotifyMin: 5,
      catsIn: ['Item satışı', 'Farm / Drop', 'Parti payı', 'GB satışı', 'Görev / Event', 'Diğer'],
      catsOut: ['Item alımı', 'Upgrade / Scroll', 'Pot / Malzeme', 'PUS / KC', 'GB alımı', 'Diğer'],
    },
    tx: [], trades: [], parties: [], prices: [],
    pus: { buys: [], catalog: defaultPusCatalog(), cart: [] },
    exp: { calc: { level: 60, need: '', cur: 0, target: 100, perMob: '', mobHour: '', bonus: 0, expHour: '' }, table: defaultExpTable(), sessions: [] },
    sources: [], events: [], gbMarket: null,
  };
}

let S = defaultState();
const ui = {
  page: 'panel', month: localDate().slice(0, 7), allMonths: false,
  txType: 'all', txQ: '', trFilter: 'all', trQ: '', partyId: null, priceQ: '',
  fetchCache: {},
};

/* ---------- sayı okuma / yazma ---------- */
// "1.250.000", "1,5m", "2gb", "250k", "12,50" gibi girişleri sayıya çevirir.
function parseNum(str) {
  if (typeof str === 'number') return isFinite(str) ? str : 0;
  let s = String(str ?? '').trim().replace(/\s|₺|tl$/gi, '');
  if (!s) return 0;
  const hasDot = s.includes('.'), hasCom = s.includes(',');
  if (hasDot && hasCom) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/\./g, '');
  } else if (hasCom) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && !/[a-z]/i.test(s))) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
// Para girişi: k / m / b / gb son eklerini anlar, NOAH döner.
function parseAmt(str) {
  if (typeof str === 'number') return Math.round(str);
  const s = String(str ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (!s) return 0;
  const m = s.match(/^(-?[\d.,]+)(k|m|b|gb)?$/);
  if (!m) return Math.round(parseNum(s));
  const mult = { k: 1e3, m: 1e6, b: 1e9, gb: S.settings.gbNoah || 1e8 }[m[2]] || 1;
  return Math.round(parseNum(m[1]) * mult);
}
const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfx = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const fmtN = n => nf0.format(Math.round(n || 0));
const fmtX = n => nfx.format(n || 0);
function fmtShort(n) {
  const a = Math.abs(n), sg = n < 0 ? '-' : '';
  if (a >= 1e9) return sg + nfx.format(a / 1e9) + 'b';
  if (a >= 1e6) return sg + nfx.format(a / 1e6) + 'm';
  if (a >= 1e4) return sg + nfx.format(a / 1e3) + 'k';
  return sg + nf0.format(a);
}
const gbOf = noah => noah / (S.settings.gbNoah || 1e8);
const tlOf = noah => S.settings.gbTL > 0 ? gbOf(noah) * S.settings.gbTL : null;
const noahOfTL = tl => S.settings.gbTL > 0 ? Math.round(tl / S.settings.gbTL * (S.settings.gbNoah || 1e8)) : null;
const fmtTL = tl => tl == null ? '—' : '₺' + nf2.format(tl);
const kcTL = () => S.settings.kcPackKC > 0 ? S.settings.kcPackTL / S.settings.kcPackKC : 0;
function moneyHTML(noah, opts = {}) {
  const cls = opts.sign ? (noah > 0 ? 'pos' : noah < 0 ? 'neg' : '') : '';
  const pre = opts.sign && noah > 0 ? '+' : '';
  return `<span class="${cls}" title="${fmtN(noah)} noah · ${nfx.format(gbOf(noah))} GB${tlOf(noah) != null ? ' · ' + fmtTL(tlOf(noah)) : ''}">${pre}${opts.short ? fmtShort(noah) : fmtN(noah)}</span>`;
}
function amtPreview(noah) {
  if (!noah) return 'Kısaltma kullanabilirsiniz: 250k, 50m, 1,5b, 2gb';
  const tl = tlOf(noah);
  return `= ${fmtN(noah)} noah · ${nfx.format(gbOf(noah))} GB${tl != null ? ' · ' + fmtTL(tl) : ''}`;
}

/* ---------- kayıt ---------- */
let saveTimer = null, serverMode = true;
function setSaveState(cls, txt) { const el = $('#saveState'); el.className = 'save-state ' + cls; el.lastElementChild.textContent = txt; }
function save() {
  setSaveState('busy', 'Kaydediliyor…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!DB) { setSaveState('', 'Kaydedildi'); return; }
    try {
      // exe: bu bilgisayarda da bir kopya (yedek / çevrimdışı) tutulur
      if (serverMode) {
        const r = await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DB) });
        if (!r.ok) throw new Error(await r.text());
      }
      if (typeof CLOUD !== 'undefined' && CLOUD.user) { await cloudSave(); setSaveState('', 'Buluta kaydedildi'); }
      else setSaveState('', 'Kaydedildi');
    } catch (e) { setSaveState('err', 'Kayıt hatası'); toast('Kaydedilemedi: ' + e.message, 'err'); }
  }, 700);
}
async function load() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) throw 0;
    const d = await r.json();
    DB = migrateDB(d);
    LOCAL_DB = d ? migrateDB(d) : null;
    if (LOCAL_DB && d && d.cloudUid) LOCAL_DB.cloudUid = d.cloudUid;
    const info = await (await fetch('/api/info')).json();
    $('#ver').textContent = 'v' + info.version;
    ui.dataDir = info.dataDir;
  } catch {
    serverMode = false;
    DB = defaultDB(); // web: kayıtlar yalnızca Google hesabında (bulutta) tutulur
  }
}
function migrate(d) {
  const def = defaultState();
  const out = Object.assign(def, d);
  out.settings = Object.assign(defaultState().settings, d.settings || {});
  out.pus = Object.assign({ buys: [], catalog: defaultPusCatalog(), cart: [] }, d.pus || {});
  if (!out.pus.catalog || !out.pus.catalog.length) out.pus.catalog = defaultPusCatalog();
  out.events = d.events || [];
  out.exp = Object.assign(def.exp, d.exp || {});
  if (!out.exp.table || !Object.keys(out.exp.table).length) out.exp.table = defaultExpTable();
  out.exp.calc = Object.assign(defaultState().exp.calc, (d.exp || {}).calc || {});
  return out;
}

/* ---------- hesaplar ve karakterler (v2 veri yapısı) ----------
   DB.shared  : tüm karakterlerde ortak (ayarlar, fiyatlar, eventler, PUS katalogu, EXP tablosu)
   DB.accounts: [{ id, user, salt, hash, chars: [{ ..., data: { tx, trades, parties, pus, exp } }] }]
   S           : aktif karakterin verisine bağlanan "görünüm"; eski kodun tamamı S üzerinden çalışır. */
let DB = null;
const CUR = { acc: null, ch: null };
function newCharData(level) {
  const c = defaultState().exp.calc;
  if (level) c.level = level;
  return { tx: [], trades: [], parties: [], pus: { buys: [], cart: [] }, exp: { calc: c, sessions: [] } };
}
function presetEvents() {
  return USKO_EVENTS.map(e => ({ id: uid(), pid: e.pid, name: e.name, days: [...e.days], times: [...e.times], dur: e.dur, color: e.color, note: e.note, until: e.until || '', off: false, src: 'usko' }));
}
function defaultDB() {
  const d = defaultState();
  return { v: 2, shared: { settings: d.settings, prices: [], sources: [], events: presetEvents(), gbMarket: null, pusCatalog: defaultPusCatalog(), expTable: defaultExpTable() }, accounts: [], legacy: null };
}
function charDataFrom(st) {
  return { tx: st.tx || [], trades: st.trades || [], parties: st.parties || [], pus: { buys: (st.pus || {}).buys || [], cart: (st.pus || {}).cart || [] }, exp: { calc: (st.exp || {}).calc || defaultState().exp.calc, sessions: (st.exp || {}).sessions || [] } };
}
function migrateDB(d) {
  if (!d) return defaultDB();
  if (d.v === 2 && d.shared) {
    const db = defaultDB();
    db.shared = Object.assign(db.shared, d.shared);
    db.shared.settings = Object.assign(defaultState().settings, d.shared.settings || {});
    if (!db.shared.pusCatalog || !db.shared.pusCatalog.length) db.shared.pusCatalog = defaultPusCatalog();
    if (!db.shared.expTable || !Object.keys(db.shared.expTable).length) db.shared.expTable = defaultExpTable();
    db.accounts = (d.accounts || []).map(a => ({ ...a, chars: (a.chars || []).map(c => ({ ...c, data: Object.assign(newCharData(c.level), c.data || {}) })) }));
    db.legacy = d.legacy || null;
    db.lastLogin = d.lastLogin || null;
    if (d.cloudUid) db.cloudUid = d.cloudUid;
    return db;
  }
  // v1 (tek kullanıcılı eski sürüm) → ortak ayarlar + ilk karaktere aktarılacak kayıtlar
  const old = migrate(d);
  const db = defaultDB();
  Object.assign(db.shared, { settings: old.settings, prices: old.prices, sources: old.sources, gbMarket: old.gbMarket, pusCatalog: old.pus.catalog, expTable: old.exp.table });
  if (old.events && old.events.length) db.shared.events = old.events;
  const hasData = old.tx.length || old.trades.length || old.parties.length || old.pus.buys.length || old.exp.sessions.length;
  db.legacy = hasData ? charDataFrom(old) : null;
  return db;
}
function bindView() {
  const ch = CUR.ch;
  const data = ch ? ch.data : newCharData();
  const v = { v: 2 };
  const def = (o, k, get, set) => Object.defineProperty(o, k, { get, set, enumerable: true, configurable: true });
  ['settings', 'prices', 'sources', 'events', 'gbMarket'].forEach(k => def(v, k, () => DB.shared[k], x => { DB.shared[k] = x; }));
  ['tx', 'trades', 'parties'].forEach(k => def(v, k, () => data[k], x => { data[k] = x; }));
  const pus = {};
  def(pus, 'buys', () => data.pus.buys, x => { data.pus.buys = x; });
  def(pus, 'cart', () => data.pus.cart, x => { data.pus.cart = x; });
  def(pus, 'catalog', () => DB.shared.pusCatalog, x => { DB.shared.pusCatalog = x; });
  def(v, 'pus', () => pus, () => { });
  const exp = {};
  def(exp, 'calc', () => data.exp.calc, x => { data.exp.calc = x; });
  def(exp, 'sessions', () => data.exp.sessions, x => { data.exp.sessions = x; });
  def(exp, 'table', () => DB.shared.expTable, x => { DB.shared.expTable = x; });
  def(v, 'exp', () => exp, () => { });
  S = v;
}

/* ---------- bildirim ---------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3000);
}

/* ---------- ikonlar ---------- */
const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  panel: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  kasa: I('<path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l2-4h14l2 4"/><path d="M16 13h2"/>'),
  ticaret: I('<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>'),
  parti: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.2 5 2.6 5 5.8"/>'),
  pus: I('<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  exp: I('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  fiyat: I('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>'),
  internet: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>'),
  ayar: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  gb: I('<path d="M4 15l2-7h12l2 7z"/><path d="M3 15h18v4H3z"/><path d="M9 11h6"/>'),
  pazar: I('<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>'),
  event: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 14v3l2 1"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  del: I('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
  dl: I('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  up: I('<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>'),
  refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  copy: I('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  sell: I('<path d="M12 3v18"/><path d="M17 7.5C17 5.6 14.8 4 12 4S7 5.6 7 7.5 9.2 11 12 11.5s5 1.7 5 3.8-2.2 4.2-5 4.2-5-1.8-5-3.8"/>'),
};

/* ---------- sayfalar ---------- */
const PAGES = [
  { sec: 'Defter' },
  { id: 'panel', t: 'Panel', d: 'Aylık özet ve son hareketler', month: true },
  { id: 'kasa', t: 'Gelir / Gider', d: 'Tüm para hareketleri', month: true },
  { id: 'ticaret', t: 'Item Ticareti', d: 'Alış – satış ve kâr takibi', month: true },
  { id: 'parti', t: 'Parti & Drop', d: 'Düşen itemler ve pay dağılımı' },
  { sec: 'Canlı Veri' },
  { id: 'gb', t: 'GB Fiyatları', d: 'Sitelerin sunucu bazında canlı GB alış / satış fiyatları' },
  { id: 'pazar', t: 'Canlı Pazar', d: 'Canlı pazar ilanları' },
  { id: 'event', t: 'Event Takvimi', d: 'Haftalık event saatleri ve geri sayım' },
  { sec: 'Hesaplayıcılar' },
  { id: 'pus', t: 'PUS Hesabı', d: 'Sepete ekle: KC → TL → GB maliyeti', month: true },
  { id: 'exp', t: 'EXP Hesabı', d: 'Seviye süresi, mob sayısı ve oturum takibi' },
  { sec: 'Veri' },
  { id: 'fiyat', t: 'Fiyat Listesi', d: 'Item pazar fiyatları' },
  { id: 'internet', t: 'Yönetim', d: 'Veri kaynakları, web kaynakları ve teşhis (yalnızca admin)', admin: true },
  { id: 'ayar', t: 'Ayarlar', d: 'Oranlar, kategoriler ve yedekleme' },
];

function renderNav() {
  const admin = typeof isAdmin === 'function' && isAdmin();
  $('#nav').innerHTML = PAGES.filter(p => !p.admin || admin).map(p => p.sec
    ? `<div class="nav-sec">${p.sec}</div>`
    : `<button class="nav-btn ${ui.page === p.id ? 'on' : ''}" data-act="go" data-id="${p.id}">${ICON[p.id]}<span>${p.t}</span></button>`).join('');
}
function renderTicker() {
  const st = S.settings;
  $('#ticker').innerHTML = `
    <span class="tick" data-act="go" data-id="gb" title="1 Gold Bar fiyatı">1 GB<b>${st.gbTL ? fmtTL(st.gbTL) : 'girilmedi'}</b></span>
    <span class="tick" data-act="go" data-id="gb" title="Dolar kuru">USD<b>${st.usdTL ? '₺' + nf2.format(st.usdTL) : '—'}</b></span>`;
  const bs = $('#brandSub'); if (bs) bs.textContent = [st.charName, st.server].filter(Boolean).join(' · ') || 'Knight Online defteri';
}

function render() {
  // odaktaki alanı koru (yeniden çizimden sonra geri ver)
  const a = document.activeElement, fk = a && a.dataset && a.dataset.fk;
  let selS = null; try { selS = a.selectionStart; } catch { }
  if ((PAGES.find(x => x.id === ui.page) || {}).admin && !(typeof isAdmin === 'function' && isAdmin())) ui.page = 'panel';
  const p = PAGES.find(x => x.id === ui.page);
  $('#pageTitle').textContent = p.t;
  $('#pageSub').textContent = p.d;
  $('#monthPick').style.display = p.month ? '' : 'none';
  $('#monthLabel').textContent = ui.allMonths && ui.page === 'kasa' ? 'Tüm aylar' : monthName(ui.month);
  renderNav(); renderTicker();
  $('#content').innerHTML = VIEWS[ui.page]();
  if (fk) {
    const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (el) { el.focus(); try { if (selS != null) el.setSelectionRange(selS, selS); } catch { } }
  }
}

/* ==========================================================================
   HESAPLAMA ÇEKİRDEĞİ
   ========================================================================== */
const txNoah = t => t.unit === 'tl' ? (noahOfTL(t.amount) ?? 0) : t.amount;
const txTL = t => t.unit === 'tl' ? t.amount : tlOf(t.amount);
const inMonth = (d, ym) => (d || '').slice(0, 7) === ym;

function tradeCalc(t) {
  const fee = (t.feePct || 0) / 100;
  const netSell = t.sellPrice * (1 - fee);
  const unit = netSell - t.buyPrice;
  const profit = unit * t.qty;
  const roi = t.buyPrice > 0 ? unit / t.buyPrice * 100 : 0;
  const breakeven = fee < 1 ? t.buyPrice / (1 - fee) : 0;
  return { netSell, unit, profit, roi, breakeven, cost: t.buyPrice * t.qty };
}

function partyCalc(p) {
  const fee = (p.feePct || 0) / 100;
  const members = p.members.length ? p.members : [];
  const fallbackHolder = p.leaderId || (members.find(m => m.me) || members[0] || {}).id;
  const rows = p.drops.map(d => {
    const unit = d.sold && d.soldPrice ? d.soldPrice : d.value;
    const total = unit * (d.qty || 1);
    return { d, total, net: total * (1 - fee), holder: d.looter || fallbackHolder };
  });
  const gross = sum(rows, r => r.total);
  const feeAmt = gross * fee;
  const costs = p.costs || 0;
  const net = gross - feeAmt - costs;
  const leaderAmt = p.leaderId ? Math.max(0, net) * (p.leaderPct || 0) / 100 : 0;
  const pool = net - leaderAmt;
  const W = sum(members, m => +m.weight || 0) || 1;
  const res = members.map(m => {
    const share = pool * (+m.weight || 0) / W;
    const lead = m.id === p.leaderId ? leaderAmt : 0;
    const refund = m.id === p.costPayer ? costs : 0;
    const due = share + lead + refund;
    const hold = sum(rows.filter(r => r.holder === m.id), r => r.net);
    return { m, share, lead, refund, due, hold, bal: due - hold, income: share + lead };
  });
  // borç – alacak eşleştirme
  const cred = res.filter(r => r.bal > 0.5).map(r => ({ n: r.m.name, v: r.bal })).sort((a, b) => b.v - a.v);
  const debt = res.filter(r => r.bal < -0.5).map(r => ({ n: r.m.name, v: -r.bal })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const v = Math.min(debt[i].v, cred[j].v);
    if (v >= 1) transfers.push({ from: debt[i].n, to: cred[j].n, v: Math.round(v) });
    debt[i].v -= v; cred[j].v -= v;
    if (debt[i].v < 0.5) i++;
    if (cred[j].v < 0.5) j++;
  }
  const unassigned = p.drops.filter(d => !d.looter).length;
  return { rows, gross, feeAmt, costs, net, leaderAmt, pool, res, transfers, unassigned, perWeight: pool / W };
}

const pusTL = b => (b.kc || 0) * (b.qty || 1) * kcTL();

function monthSummary(ym) {
  const tx = S.tx.filter(t => inMonth(t.date, ym));
  const txIn = sum(tx.filter(t => t.type === 'gelir'), txNoah);
  const txOut = sum(tx.filter(t => t.type === 'gider'), txNoah);
  const tradeP = sum(S.trades.filter(t => t.status === 'satildi' && inMonth(t.sellDate, ym)), t => tradeCalc(t).profit);
  const partyIn = sum(S.parties.filter(p => inMonth(p.date, ym)), p => { const me = partyCalc(p).res.find(r => r.m.me); return me ? me.income : 0; });
  const pusTLsum = sum(S.pus.buys.filter(b => inMonth(b.date, ym)), pusTL);
  const pusOut = noahOfTL(pusTLsum) ?? 0;
  const gelir = txIn + Math.max(0, tradeP) + partyIn;
  const gider = txOut + Math.max(0, -tradeP) + pusOut;
  const tlMissing = !S.settings.gbTL && (tx.some(t => t.unit === 'tl') || pusTLsum > 0);
  return { txIn, txOut, tradeP, partyIn, pusOut, pusTL: pusTLsum, gelir, gider, net: gelir - gider, tlMissing, count: tx.length };
}

/* ==========================================================================
   GÖRÜNÜMLER
   ========================================================================== */
const VIEWS = {};
const empty = (t, s) => `<div class="empty"><b>${t}</b>${s || ''}</div>`;
const stat = (lbl, valHTML, sub, color) => `<div class="card stat" style="--glow:${color || 'transparent'}"><div class="lbl"><span class="chip" style="background:${color || 'var(--tx3)'}"></span>${lbl}</div><div class="val">${valHTML}</div><div class="sub2">${sub || '&nbsp;'}</div></div>`;
const tlSub = n => { const t = tlOf(n); return t == null ? fmtShort(n) + ' · ' + nfx.format(gbOf(n)) + ' GB' : fmtTL(t) + ' · ' + nfx.format(gbOf(n)) + ' GB'; };
const actBtns = (kind, id, extra = '') => `<div class="acts">${extra}<button class="icon-btn" title="Düzenle" data-act="${kind}-edit" data-id="${id}">${ICON.edit}</button><button class="icon-btn" title="Sil" data-act="${kind}-del" data-id="${id}">${ICON.del}</button></div>`;

/* ---------- PANEL ---------- */
VIEWS.panel = () => {
  const m = monthSummary(ui.month);
  const prev = monthSummary(addMonth(ui.month, -1));
  const diff = prev.net ? ((m.net - prev.net) / Math.abs(prev.net) * 100) : null;
  const stock = S.trades.filter(t => t.status !== 'satildi');
  const stockVal = sum(stock, t => t.buyPrice * t.qty);
  const months = Array.from({ length: 12 }, (_, i) => addMonth(ui.month, i - 11));
  const series = months.map(ym => ({ ym, ...monthSummary(ym) }));
  const maxV = Math.max(1, ...series.map(s => Math.max(s.gelir, s.gider)));
  const recent = [...S.tx].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 7);
  const br = [
    ['Kasa gelirleri', m.txIn, 'var(--green)'],
    ['Ticaret kârı (net)', m.tradeP, 'var(--blue)'],
    ['Parti payım', m.partyIn, 'var(--violet)'],
    ['Kasa giderleri', -m.txOut, 'var(--red)'],
    ['PUS harcaması', -m.pusOut, 'var(--gold)'],
  ];
  const brMax = Math.max(1, ...br.map(b => Math.abs(b[1])));
  return `
  ${m.tlMissing ? `<div class="callout y" style="margin-bottom:16px">Bu ayda TL cinsinden kayıtlar var ama 1 GB'ın TL fiyatı girilmemiş; bu kayıtlar noah toplamına katılamıyor. <a href="#" data-act="go" data-id="internet" class="gold">GB fiyatını gir →</a></div>` : ''}
  <div class="grid g4">
    ${stat('Bu ay gelir', moneyHTML(m.gelir, { short: true }), tlSub(m.gelir), 'var(--green)')}
    ${stat('Bu ay gider', moneyHTML(m.gider, { short: true }), tlSub(m.gider), 'var(--red)')}
    ${stat('Net kazanç', moneyHTML(m.net, { short: true, sign: true }), (diff == null ? 'Önceki ay verisi yok' : `Geçen aya göre <span class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '▲' : '▼'} %${fmtX(Math.abs(diff))}</span>`), 'var(--gold)')}
    ${stat('Stoktaki item maliyeti', moneyHTML(stockVal, { short: true }), `${sum(stock, t => t.qty)} adet · ${tlOf(stockVal) != null ? fmtTL(tlOf(stockVal)) : nfx.format(gbOf(stockVal)) + ' GB'}`, 'var(--blue)')}
  </div>
  <div class="grid g-wide" style="margin-top:16px">
    <div class="card">
      <div class="card-h"><h3>Son 12 ay</h3><div class="legend"><span><i style="background:#3ec27a"></i>Gelir</span><span><i style="background:#ef5b5b"></i>Gider</span></div></div>
      <div class="bars">${series.map(s => `
        <div class="bar-col ${s.ym === ui.month ? 'cur' : ''}" title="${monthName(s.ym)}\nGelir: ${fmtN(s.gelir)}\nGider: ${fmtN(s.gider)}\nNet: ${fmtN(s.net)}">
          <div class="bar-pair"><div class="bar in" style="height:${s.gelir / maxV * 100}%"></div><div class="bar out" style="height:${s.gider / maxV * 100}%"></div></div>
          <div class="bar-lbl">${shortMonth(s.ym)}</div>
        </div>`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-h"><h3>${monthName(ui.month)} dökümü</h3></div>
      <div class="stack" style="gap:12px">${br.map(b => `
        <div><div class="row" style="justify-content:space-between;margin-bottom:5px"><span class="mut">${b[0]}</span><b class="num">${moneyHTML(b[1], { sign: true })}</b></div>
        <div class="meter"><div style="width:${Math.abs(b[1]) / brMax * 100}%;background:${b[2]}"></div></div></div>`).join('')}
        <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:12px"><b>Net</b><b class="big-result" style="font-size:22px">${moneyHTML(m.net, { sign: true })}</b></div>
      </div>
    </div>
  </div>
  <div class="grid g-wide" style="margin-top:16px">
    <div class="card">
      <div class="card-h"><h3>Son hareketler</h3><button class="btn sm ghost" data-act="go" data-id="kasa">Tümü →</button></div>
      ${recent.length ? `<div class="tbl-wrap"><table><tbody>${recent.map(t => `
        <tr><td class="mut" style="width:96px">${fmtDate(t.date)}</td><td>${t.type === 'gelir' ? '<span class="badge g">Gelir</span>' : '<span class="badge r">Gider</span>'}</td>
        <td>${esc(t.cat)}<div class="hint">${esc(t.desc)}</div></td><td class="num">${t.unit === 'tl' ? `<span class="${t.type === 'gelir' ? 'pos' : 'neg'}">${fmtTL(t.amount)}</span>` : moneyHTML(t.type === 'gelir' ? t.amount : -t.amount, { sign: true })}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Henüz hareket yok', 'İlk gelir veya giderinizi ekleyerek başlayın.')}
    </div>
    <div class="card">
      <div class="card-h"><h3>Hızlı işlem</h3></div>
      <div class="grid g2" style="gap:10px">
        <button class="btn" data-act="tx-add" data-type="gelir">${ICON.plus} Gelir ekle</button>
        <button class="btn" data-act="tx-add" data-type="gider">${ICON.plus} Gider ekle</button>
        <button class="btn" data-act="tr-add">${ICON.plus} Ticaret ekle</button>
        <button class="btn" data-act="party-new">${ICON.plus} Yeni parti</button>
        <button class="btn" data-act="pus-add">${ICON.plus} PUS alımı</button>
        <button class="btn" data-act="go" data-id="exp">${ICON.exp} EXP hesapla</button>
      </div>
      <div class="kv" style="margin-top:18px">
        <span class="k">Bu ay kayıt</span><span class="v">${m.count}</span>
        <span class="k">Açık partiler</span><span class="v">${S.parties.filter(p => p.status !== 'kapandi').length}</span>
        <span class="k">1 GB</span><span class="v">${fmtN(S.settings.gbNoah)} noah</span>
      </div>
    </div>
  </div>`;
};

/* ---------- GELİR / GİDER ---------- */
VIEWS.kasa = () => {
  let list = S.tx.filter(t => ui.allMonths || inMonth(t.date, ui.month));
  if (ui.txType !== 'all') list = list.filter(t => t.type === ui.txType);
  if (ui.txQ) { const q = ui.txQ.toLocaleLowerCase('tr'); list = list.filter(t => (t.cat + ' ' + t.desc).toLocaleLowerCase('tr').includes(q)); }
  list.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const tIn = sum(list.filter(t => t.type === 'gelir'), txNoah), tOut = sum(list.filter(t => t.type === 'gider'), txNoah);
  const cats = {};
  list.forEach(t => { const k = t.type + '|' + t.cat; cats[k] = (cats[k] || 0) + txNoah(t); });
  const catArr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const cMax = Math.max(1, ...catArr.map(c => c[1]));
  return `
  <div class="row" style="margin-bottom:16px">
    <div class="seg">${[['all', 'Tümü'], ['gelir', 'Gelir'], ['gider', 'Gider']].map(([k, l]) => `<button class="${ui.txType === k ? 'on' : ''}" data-act="set" data-k="txType" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="search" style="width:260px"><input class="inp" placeholder="Kategori / açıklama ara" data-fk="txQ" data-bind-ui="txQ" value="${esc(ui.txQ)}"></label>
    <label class="check"><input type="checkbox" data-act="toggle-all" ${ui.allMonths ? 'checked' : ''}> Tüm aylar</label>
    <div class="spacer"></div>
    <button class="btn" data-act="csv-tx">${ICON.dl} CSV</button>
    <button class="btn" data-act="tx-add" data-type="gider">${ICON.plus} Gider</button>
    <button class="btn pri" data-act="tx-add" data-type="gelir">${ICON.plus} Gelir</button>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    ${stat('Gelir', moneyHTML(tIn), tlSub(tIn), 'var(--green)')}
    ${stat('Gider', moneyHTML(tOut), tlSub(tOut), 'var(--red)')}
    ${stat('Fark', moneyHTML(tIn - tOut, { sign: true }), tlSub(tIn - tOut), 'var(--gold)')}
  </div>
  <div class="grid g-wide">
    <div class="card" style="padding:0;overflow:hidden">
      ${list.length ? `<div class="tbl-wrap" style="border:0;border-radius:0"><table>
      <thead><tr><th>Tarih</th><th>Tür</th><th>Kategori</th><th>Açıklama</th><th class="num">Tutar (noah)</th><th class="num">TL</th><th></th></tr></thead>
      <tbody>${list.map(t => `<tr>
        <td class="mut">${fmtDate(t.date)}</td>
        <td>${t.type === 'gelir' ? '<span class="badge g">Gelir</span>' : '<span class="badge r">Gider</span>'}</td>
        <td>${esc(t.cat)}</td><td>${esc(t.desc) || '<span class="mut">—</span>'}</td>
        <td class="num">${t.unit === 'tl' && !S.settings.gbTL ? '<span class="mut">GB fiyatı yok</span>' : moneyHTML(t.type === 'gelir' ? txNoah(t) : -txNoah(t), { sign: true })}</td>
        <td class="num mut">${fmtTL(txTL(t))}${t.unit === 'tl' ? ' <span class="badge y">TL</span>' : ''}</td>
        <td>${actBtns('tx', t.id)}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Bu filtrede kayıt yok', 'Sağ üstten gelir veya gider ekleyin.')}
    </div>
    <div class="card"><div class="card-h"><h3>Kategoriler</h3><span class="sub">${ui.allMonths ? 'Tüm zamanlar' : monthName(ui.month)}</span></div>
      ${catArr.length ? `<div class="stack" style="gap:11px">${catArr.map(([k, v]) => { const [tp, c] = k.split('|'); return `
        <div><div class="row" style="justify-content:space-between;margin-bottom:4px"><span>${esc(c)} <span class="badge ${tp === 'gelir' ? 'g' : 'r'}" style="margin-left:4px">${tp}</span></span><b class="num">${fmtShort(v)}</b></div>
        <div class="meter"><div style="width:${v / cMax * 100}%;background:${tp === 'gelir' ? 'var(--green)' : 'var(--red)'}"></div></div></div>`; }).join('')}</div>` : '<div class="mut">Veri yok</div>'}
    </div>
  </div>`;
};

function txForm(t, type) {
  const isNew = !t;
  t = t || { id: uid(), date: localDate(), type, cat: '', desc: '', amount: 0, unit: 'noah' };
  const cats = t.type === 'gelir' ? S.settings.catsIn : S.settings.catsOut;
  openForm({
    title: (isNew ? 'Yeni ' : 'Düzenle: ') + (t.type === 'gelir' ? 'gelir' : 'gider'),
    data: { ...t, amount: t.unit === 'tl' ? nfx.format(t.amount) : (t.amount ? fmtN(t.amount) : '') },
    fields: [
      { k: 'type', label: 'Tür', type: 'select', options: [['gelir', 'Gelir'], ['gider', 'Gider']] },
      { k: 'date', label: 'Tarih', type: 'date' },
      { k: 'cat', label: 'Kategori', type: 'text', list: [...new Set([...S.settings.catsIn, ...S.settings.catsOut])], placeholder: cats[0] },
      { k: 'unit', label: 'Para birimi', type: 'select', options: [['noah', 'Noah (oyun parası)'], ['tl', 'TL (gerçek para)']] },
      { k: 'amount', label: 'Tutar', type: 'money', full: true, unitField: 'unit' },
      { k: 'desc', label: 'Açıklama', type: 'text', full: true, placeholder: 'örn. Krowaz satışı' },
    ],
    onSave: v => {
      const amount = v.unit === 'tl' ? parseNum(v.amount) : parseAmt(v.amount);
      if (!amount) { toast('Tutar girin.', 'err'); return false; }
      Object.assign(t, { type: v.type, date: v.date || localDate(), cat: v.cat || (v.type === 'gelir' ? S.settings.catsIn : S.settings.catsOut)[0], desc: v.desc, unit: v.unit, amount });
      if (isNew) S.tx.push(t);
      save(); render(); toast('Kaydedildi', 'ok');
    },
  });
}

/* ---------- İTEM TİCARETİ ---------- */
VIEWS.ticaret = () => {
  let list = S.trades.slice();
  if (ui.trFilter !== 'all') list = list.filter(t => (ui.trFilter === 'stok') === (t.status !== 'satildi'));
  if (ui.trQ) { const q = ui.trQ.toLocaleLowerCase('tr'); list = list.filter(t => (t.item + ' ' + (t.note || '')).toLocaleLowerCase('tr').includes(q)); }
  list.sort((a, b) => ((b.sellDate || b.buyDate) + b.id).localeCompare((a.sellDate || a.buyDate) + a.id));
  const sold = S.trades.filter(t => t.status === 'satildi');
  const stock = S.trades.filter(t => t.status !== 'satildi');
  const monthP = sum(sold.filter(t => inMonth(t.sellDate, ui.month)), t => tradeCalc(t).profit);
  const allP = sum(sold, t => tradeCalc(t).profit);
  const avgRoi = sold.length ? sum(sold, t => tradeCalc(t).roi) / sold.length : 0;
  const q = ui.quick || (ui.quick = { buy: '', sell: '', qty: '1', fee: '0' });
  const qb = parseAmt(q.buy), qs = parseAmt(q.sell), qq = parseNum(q.qty) || 1, qf = parseNum(q.fee);
  const qc = tradeCalc({ buyPrice: qb, sellPrice: qs, qty: qq, feePct: qf });
  return `
  <div class="grid g4" style="margin-bottom:16px">
    ${stat(monthName(ui.month) + ' kârı', moneyHTML(monthP, { short: true, sign: true }), tlSub(monthP), 'var(--green)')}
    ${stat('Toplam gerçekleşen kâr', moneyHTML(allP, { short: true, sign: true }), `${sold.length} satış`, 'var(--gold)')}
    ${stat('Stoktaki item', moneyHTML(sum(stock, t => t.buyPrice * t.qty), { short: true }), `${sum(stock, t => t.qty)} adet, alış maliyeti`, 'var(--blue)')}
    ${stat('Ortalama getiri', `<span class="${avgRoi >= 0 ? 'pos' : 'neg'}">%${fmtX(avgRoi)}</span>`, 'satılan işlemlerde', 'var(--violet)')}
  </div>
  <div class="grid g-trade">
    <div class="stack">
      <div class="row">
        <div class="seg">${[['all', 'Tümü'], ['stok', 'Stokta'], ['satildi', 'Satıldı']].map(([k, l]) => `<button class="${ui.trFilter === k ? 'on' : ''}" data-act="set" data-k="trFilter" data-v="${k}">${l}</button>`).join('')}</div>
        <label class="search" style="width:240px"><input class="inp" placeholder="Item ara" data-fk="trQ" data-bind-ui="trQ" value="${esc(ui.trQ)}"></label>
        <div class="spacer"></div>
        <button class="btn" data-act="csv-tr">${ICON.dl} CSV</button>
        <button class="btn pri" data-act="tr-add">${ICON.plus} Alım ekle</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
      ${list.length ? `<div class="tbl-wrap" style="border:0;border-radius:0"><table>
        <thead><tr><th>Item</th><th class="num">Adet</th><th class="num">Alış</th><th class="num">Satış</th><th class="num">Kâr</th><th class="num">Getiri</th><th>Tarih</th><th>Durum</th><th></th></tr></thead>
        <tbody>${list.map(t => { const c = tradeCalc(t); const isSold = t.status === 'satildi'; return `<tr>
          <td><b>${esc(t.item)}</b>${t.note ? `<div class="hint">${esc(t.note)}</div>` : ''}</td>
          <td class="num">${fmtN(t.qty)}</td>
          <td class="num">${moneyHTML(t.buyPrice, { short: true })}</td>
          <td class="num">${isSold ? moneyHTML(t.sellPrice, { short: true }) + (t.feePct ? `<div class="hint">%${fmtX(t.feePct)} kom.</div>` : '') : `<span class="mut">hedef ≥ ${fmtShort(c.breakeven)}</span>`}</td>
          <td class="num">${isSold ? moneyHTML(c.profit, { short: true, sign: true }) : '<span class="mut">—</span>'}</td>
          <td class="num">${isSold ? `<span class="${c.roi >= 0 ? 'pos' : 'neg'}">%${fmtX(c.roi)}</span>` : '<span class="mut">—</span>'}</td>
          <td class="mut" style="white-space:nowrap">${fmtDate(t.buyDate)}${isSold ? '<br>' + fmtDate(t.sellDate) : ''}</td>
          <td>${isSold ? '<span class="badge g">Satıldı</span>' : '<span class="badge b">Stokta</span>'}</td>
          <td>${actBtns('tr', t.id, isSold ? '' : `<button class="icon-btn" title="Sat" data-act="tr-sell" data-id="${t.id}">${ICON.sell}</button>`)}</td></tr>`; }).join('')}</tbody></table></div>`
        : empty('Ticaret kaydı yok', '“Alım ekle” ile bir item aldığınızı kaydedin; sattığınızda kârı otomatik hesaplanır.')}
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Hızlı kâr hesabı</h3><span class="sub">kaydetmeden dene</span></div>
      <div class="form">
        <label class="f">Alış (birim)<input class="inp num" data-fk="q-buy" data-bind-q="buy" value="${esc(q.buy)}" placeholder="örn. 45m"></label>
        <label class="f">Satış (birim)<input class="inp num" data-fk="q-sell" data-bind-q="sell" value="${esc(q.sell)}" placeholder="örn. 52m"></label>
        <label class="f">Adet<input class="inp num" data-fk="q-qty" data-bind-q="qty" value="${esc(q.qty)}"></label>
        <label class="f">Pazar komisyonu %<input class="inp num" data-fk="q-fee" data-bind-q="fee" value="${esc(q.fee)}"></label>
      </div>
      <div class="kv" style="margin-top:16px">
        <span class="k">Toplam maliyet</span><span class="v">${fmtN(qb * qq)}</span>
        <span class="k">Eline geçen (komisyon sonrası)</span><span class="v">${fmtN(qc.netSell * qq)}</span>
        <span class="k">Başa baş satış fiyatı</span><span class="v">${fmtN(qc.breakeven)}</span>
        <span class="sep"></span>
        <span class="k">Kâr</span><span class="v big-result" style="font-size:22px">${moneyHTML(qc.profit, { sign: true })}</span>
        <span class="k">Getiri</span><span class="v ${qc.roi >= 0 ? 'pos' : 'neg'}">%${fmtX(qc.roi)}</span>
        <span class="k">TL karşılığı</span><span class="v">${fmtTL(tlOf(qc.profit))}</span>
      </div>
    </div>
  </div>`;
};

function tradeForm(t, mode) {
  const isNew = !t;
  t = t || { id: uid(), item: '', qty: 1, buyPrice: 0, buyDate: localDate(), sellPrice: 0, sellDate: '', feePct: 0, status: 'stok', note: '' };
  const sellMode = mode === 'sell';
  const fields = sellMode ? [
    { k: 'sellPrice', label: 'Birim satış fiyatı', type: 'money', full: true },
    { k: 'sellDate', label: 'Satış tarihi', type: 'date' },
    { k: 'feePct', label: 'Pazar komisyonu %', type: 'number', hint: 'Satıştan kesilen oran (yoksa 0)' },
  ] : [
    { k: 'item', label: 'Item', type: 'text', full: true, list: S.prices.map(p => p.name), placeholder: 'örn. Raptor +7' },
    { k: 'qty', label: 'Adet', type: 'number' },
    { k: 'buyDate', label: 'Alış tarihi', type: 'date' },
    { k: 'buyPrice', label: 'Birim alış fiyatı', type: 'money', full: true },
    { k: 'status', label: 'Durum', type: 'select', options: [['stok', 'Stokta'], ['satildi', 'Satıldı']] },
    { k: 'feePct', label: 'Pazar komisyonu %', type: 'number' },
    { k: 'sellPrice', label: 'Birim satış fiyatı', type: 'money', hint: 'Satıldıysa doldurun' },
    { k: 'sellDate', label: 'Satış tarihi', type: 'date' },
    { k: 'note', label: 'Not', type: 'text', full: true },
  ];
  openForm({
    title: sellMode ? 'Sat: ' + t.item : isNew ? 'Yeni alım' : 'Düzenle: ' + t.item,
    data: { ...t, buyPrice: t.buyPrice ? fmtN(t.buyPrice) : '', sellPrice: t.sellPrice ? fmtN(t.sellPrice) : '', sellDate: t.sellDate || (sellMode ? localDate() : '') },
    fields,
    onSave: v => {
      if (sellMode) {
        const sp = parseAmt(v.sellPrice);
        if (!sp) { toast('Satış fiyatı girin.', 'err'); return false; }
        Object.assign(t, { sellPrice: sp, sellDate: v.sellDate || localDate(), feePct: parseNum(v.feePct), status: 'satildi' });
      } else {
        if (!v.item.trim()) { toast('Item adı girin.', 'err'); return false; }
        Object.assign(t, { item: v.item.trim(), qty: Math.max(1, Math.round(parseNum(v.qty))), buyDate: v.buyDate, buyPrice: parseAmt(v.buyPrice), status: v.status, feePct: parseNum(v.feePct), sellPrice: parseAmt(v.sellPrice), sellDate: v.sellDate, note: v.note });
        if (t.status === 'satildi' && !t.sellDate) t.sellDate = localDate();
        if (isNew) S.trades.push(t);
      }
      save(); render(); toast('Kaydedildi', 'ok');
    },
  });
}

/* ---------- PARTİ & DROP ---------- */
function newParty() {
  const me = (CUR.ch && CUR.ch.name) || 'Ben';
  const members = Array.from({ length: 8 }, (_, i) => ({ id: uid(), name: i === 0 ? me : 'Üye ' + (i + 1), weight: 1, me: i === 0 }));
  const p = { id: uid(), name: 'Parti ' + (S.parties.length + 1), date: localDate(), place: '', members, drops: [], leaderId: '', leaderPct: 0, feePct: 0, costs: 0, costPayer: '', status: 'acik', note: '' };
  S.parties.push(p); ui.partyId = p.id; ui.page = 'parti'; save(); render();
}
VIEWS.parti = () => {
  const parties = [...S.parties].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  let p = S.parties.find(x => x.id === ui.partyId) || parties[0];
  if (p) ui.partyId = p.id;
  const left = `<div class="card" style="padding:14px">
      <button class="btn pri" style="width:100%;justify-content:center;margin-bottom:12px" data-act="party-new">${ICON.plus} Yeni parti</button>
      <div class="list">${parties.map(x => { const c = partyCalc(x); return `
        <button class="list-item ${p && x.id === p.id ? 'on' : ''}" data-act="party-pick" data-id="${x.id}">
          <span class="t"><span>${esc(x.name)}</span>${x.status === 'kapandi' ? '<span class="badge g">Kapandı</span>' : '<span class="badge y">Açık</span>'}</span>
          <span class="s"><span>${fmtDate(x.date)}${x.place ? ' · ' + esc(x.place) : ''}</span><span>${fmtShort(c.gross)}</span></span>
        </button>`; }).join('') || '<div class="mut" style="padding:8px">Henüz parti yok.</div>'}</div>
    </div>`;
  if (!p) return `<div class="grid g-side">${left}<div class="card">${empty('Parti seçilmedi', '8 kişilik bir parti oluşturun, düşen itemleri girin; kimin kime ne kadar ödeyeceği otomatik hesaplanır.')}</div></div>`;
  const c = partyCalc(p);
  const memOpts = (sel, blank) => `<option value="">${blank}</option>` + p.members.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const nd = ui.newDrop || (ui.newDrop = { item: '', qty: '1', value: '', looter: '' });
  return `<div class="grid g-side">${left}
  <div class="stack">
    <div class="card">
      <div class="row">
        <label class="f" style="flex:2;min-width:180px">Parti adı<input class="inp" data-fk="p-name" data-pf="name" value="${esc(p.name)}"></label>
        <label class="f" style="width:160px">Tarih<input class="inp" type="date" data-fk="p-date" data-pf="date" value="${esc(p.date)}"></label>
        <label class="f" style="flex:1;min-width:150px">Yer / Boss<input class="inp" data-fk="p-place" data-pf="place" value="${esc(p.place)}" placeholder="örn. Krowaz, Juraid"></label>
        <label class="f">Durum<div class="seg">${[['acik', 'Açık'], ['kapandi', 'Kapandı']].map(([k, l]) => `<button class="${p.status === k ? 'on' : ''}" data-act="party-status" data-v="${k}">${l}</button>`).join('')}</div></label>
        <div class="spacer"></div>
        <button class="btn" data-act="party-copy" title="Discord / oyun içi için özet">${ICON.copy} Özeti kopyala</button>
        <button class="btn danger" data-act="party-del">${ICON.del}</button>
      </div>
    </div>
    <div class="grid g2">
      <div class="card">
        <div class="card-h"><h3>Üyeler <span class="mut" style="font-weight:400">(${p.members.length})</span></h3><button class="btn sm" data-act="member-add">${ICON.plus} Üye</button></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>İsim</th><th class="num" title="1 = tam pay, 0,5 = yarım pay">Pay oranı</th><th title="Ben">Ben</th><th></th></tr></thead>
          <tbody>${p.members.map(m => `<tr>
            <td><input class="inp cell" data-fk="m-n-${m.id}" data-mf="name" data-id="${m.id}" value="${esc(m.name)}"></td>
            <td style="width:110px"><input class="inp cell num" data-fk="m-w-${m.id}" data-mf="weight" data-id="${m.id}" value="${fmtX(m.weight)}"></td>
            <td style="width:50px"><input type="radio" name="me" data-act="member-me" data-id="${m.id}" ${m.me ? 'checked' : ''} style="accent-color:var(--gold)"></td>
            <td style="width:40px"><button class="icon-btn" title="Çıkar" data-act="member-del" data-id="${m.id}">${ICON.del}</button></td></tr>`).join('')}</tbody>
        </table></div>
        <div class="hint" style="margin-top:8px">Pay oranı: 1 = tam pay, 0,5 = yarım pay (ör. geç katılan). “Ben” işaretli üyenin payı aylık gelirinize eklenir.</div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Kesintiler</h3></div>
        <div class="form">
          <label class="f">Lider<select class="inp" data-pf="leaderId">${memOpts(p.leaderId, 'Lider payı yok')}</select></label>
          <label class="f">Lider payı %<input class="inp num" data-fk="p-lp" data-pf="leaderPct" data-num="1" value="${fmtX(p.leaderPct)}"></label>
          <label class="f">Pazar komisyonu %<input class="inp num" data-fk="p-fee" data-pf="feePct" data-num="1" value="${fmtX(p.feePct)}"></label>
          <label class="f">Ortak masraf (pot, scroll…)<input class="inp num" data-fk="p-cost" data-pf="costs" data-money="1" value="${p.costs ? fmtN(p.costs) : ''}" placeholder="0"></label>
          <label class="f full">Masrafı ödeyen<select class="inp" data-pf="costPayer">${memOpts(p.costPayer, 'Belirtilmedi')}</select><span class="hint">Seçilirse ödediği masraf ona geri verilir.</span></label>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Düşen itemler</h3><span class="sub">${p.drops.length} item · toplam ${fmtN(c.gross)} noah</span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Item</th><th class="num" style="width:80px">Adet</th><th class="num" style="width:150px">Birim değer</th><th style="width:150px">Kimde</th><th style="width:90px">Satıldı</th><th class="num" style="width:150px">Satış fiyatı</th><th class="num">Toplam</th><th></th></tr></thead>
        <tbody>
          <tr style="background:var(--bg2)">
            <td><input class="inp" list="dl-prices" data-fk="nd-item" data-nd="item" value="${esc(nd.item)}" placeholder="Item adı (Enter ile ekle)"></td>
            <td><input class="inp num" data-fk="nd-qty" data-nd="qty" value="${esc(nd.qty)}"></td>
            <td><input class="inp num" data-fk="nd-value" data-nd="value" value="${esc(nd.value)}" placeholder="örn. 30m"></td>
            <td><select class="inp" data-nd="looter">${memOpts(nd.looter, '— seç —')}</select></td>
            <td colspan="3"><button class="btn pri sm" data-act="drop-add">${ICON.plus} Ekle</button></td><td></td>
          </tr>
          ${p.drops.map(d => { const r = c.rows.find(x => x.d === d); return `<tr>
            <td><input class="inp cell" data-fk="d-i-${d.id}" data-df="item" data-id="${d.id}" value="${esc(d.item)}"></td>
            <td><input class="inp cell num" data-fk="d-q-${d.id}" data-df="qty" data-id="${d.id}" value="${fmtN(d.qty)}"></td>
            <td><input class="inp cell num" data-fk="d-v-${d.id}" data-df="value" data-id="${d.id}" value="${fmtN(d.value)}"></td>
            <td><select class="inp cell" data-df="looter" data-id="${d.id}">${memOpts(d.looter, 'Atanmadı')}</select></td>
            <td><label class="check"><input type="checkbox" data-df="sold" data-id="${d.id}" ${d.sold ? 'checked' : ''}></label></td>
            <td>${d.sold ? `<input class="inp cell num" data-fk="d-s-${d.id}" data-df="soldPrice" data-id="${d.id}" value="${d.soldPrice ? fmtN(d.soldPrice) : ''}" placeholder="birim">` : '<span class="mut">—</span>'}</td>
            <td class="num"><b>${fmtShort(r.total)}</b></td>
            <td><button class="icon-btn" title="Sil" data-act="drop-del" data-id="${d.id}">${ICON.del}</button></td></tr>`; }).join('')}
        </tbody></table></div>
      <datalist id="dl-prices">${S.prices.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
      ${c.unassigned ? `<div class="hint" style="margin-top:8px">${c.unassigned} item kimseye atanmamış — hesapta ${esc((p.members.find(m => m.id === (p.leaderId || (p.members.find(x => x.me) || p.members[0] || {}).id)) || {}).name || '')} kişisinde sayılıyor.</div>` : ''}
    </div>
    <div class="grid g-wide">
      <div class="card">
        <div class="card-h"><h3>Pay dağılımı</h3><span class="sub">1 pay = ${fmtN(c.perWeight)} noah</span></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Üye</th><th class="num">Hakkı</th><th class="num">Elindeki</th><th class="num">Durum</th></tr></thead>
          <tbody>${c.res.map(r => `<tr>
            <td>${esc(r.m.name)} ${r.m.me ? '<span class="badge y">ben</span>' : ''}${r.lead ? '<span class="badge b">lider</span>' : ''}<div class="hint">${fmtX(r.m.weight)} pay${r.refund ? ' · masraf iadesi ' + fmtShort(r.refund) : ''}</div></td>
            <td class="num">${moneyHTML(r.due)}</td>
            <td class="num mut">${fmtN(r.hold)}</td>
            <td class="num">${Math.abs(r.bal) < 1 ? '<span class="mut">tamam</span>' : r.bal > 0 ? `<span class="pos">alacak ${fmtShort(r.bal)}</span>` : `<span class="neg">verecek ${fmtShort(-r.bal)}</span>`}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Özet</h3></div>
        <div class="kv">
          <span class="k">Toplam drop değeri</span><span class="v">${fmtN(c.gross)}</span>
          <span class="k">Pazar komisyonu</span><span class="v neg">-${fmtN(c.feeAmt)}</span>
          <span class="k">Ortak masraf</span><span class="v neg">-${fmtN(c.costs)}</span>
          <span class="k">Lider payı</span><span class="v neg">-${fmtN(c.leaderAmt)}</span>
          <span class="sep"></span>
          <span class="k">Dağıtılacak</span><span class="v gold">${fmtN(c.pool)}</span>
        </div>
        <h3 style="font:600 14px var(--head);margin:18px 0 10px">Ödemeler</h3>
        <div class="stack" style="gap:6px">${c.transfers.length ? c.transfers.map(t => `<div class="transfer"><b>${esc(t.from)}</b><span class="arrow">→</span><b>${esc(t.to)}</b><span class="spacer"></span><span class="num">${fmtN(t.v)}</span></div>`).join('') : '<div class="mut">Ödeme gerekmiyor.</div>'}</div>
      </div>
    </div>
  </div></div>`;
};
function partySummaryText(p) {
  const c = partyCalc(p);
  let s = `${p.name} — ${fmtDate(p.date)}${p.place ? ' — ' + p.place : ''}\n`;
  s += `Drop: ${fmtShort(c.gross)} | Dağıtılan: ${fmtShort(c.pool)} | 1 pay: ${fmtShort(c.perWeight)}\n`;
  s += p.drops.map(d => `• ${d.item} x${d.qty} = ${fmtShort((d.sold && d.soldPrice ? d.soldPrice : d.value) * d.qty)} (${(p.members.find(m => m.id === d.looter) || {}).name || '-'})`).join('\n') + '\n';
  s += 'Ödemeler:\n' + (c.transfers.map(t => `${t.from} → ${t.to}: ${fmtShort(t.v)}`).join('\n') || '-');
  return s;
}

/* ---------- PUS ---------- */
VIEWS.pus = () => {
  const st = S.settings, k = kcTL();
  const pc = ui.pc || (ui.pc = { kc: '', qty: '1', market: '' });
  const pkc = parseNum(pc.kc), pq = parseNum(pc.qty) || 1, pm = parseAmt(pc.market);
  const pusCost = pkc * pq * k;
  const mktTL = tlOf(pm * pq);
  const kcNoah = k && st.gbTL ? noahOfTL(k) : null;
  const buys = [...S.pus.buys].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const mBuys = buys.filter(b => inMonth(b.date, ui.month));
  const mTL = sum(mBuys, pusTL), mKC = sum(mBuys, b => b.kc * b.qty);
  let verdict = '';
  if (pkc && pm && k && st.gbTL) {
    const d = pusCost - mktTL;
    verdict = Math.abs(d) < 0.01 ? '<div class="callout">İki yol da aynı maliyette.</div>'
      : d > 0 ? `<div class="callout y"><b class="pos">Pazardan almak ${fmtTL(d)} daha ucuz</b> (%${fmtX(d / pusCost * 100)} tasarruf).</div>`
        : `<div class="callout y"><b class="pos">PUS'tan almak ${fmtTL(-d)} daha ucuz</b> (%${fmtX(-d / mktTL * 100)} tasarruf).</div>`;
  }
  return `
  <div class="grid g4" style="margin-bottom:16px">
    ${stat('1 KC fiyatı', k ? fmtTL(k) : '<span class="mut">—</span>', k ? `${fmtN(st.kcPackKC)} KC = ${fmtTL(st.kcPackTL)}` : 'Paket fiyatını girin', 'var(--gold)')}
    ${stat('1 KC noah karşılığı', kcNoah ? fmtN(kcNoah) : '<span class="mut">—</span>', kcNoah ? 'GB fiyatına göre' : 'KC ve GB fiyatı gerekli', 'var(--blue)')}
    ${stat(monthName(ui.month) + ' PUS', fmtTL(mTL), `${fmtN(mKC)} KC · ${mBuys.length} alım`, 'var(--red)')}
    ${stat('Toplam PUS harcaması', fmtTL(sum(buys, pusTL)), `${fmtN(sum(buys, b => b.kc * b.qty))} KC`, 'var(--violet)')}
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="card-h"><h3>KC paket fiyatı</h3><span class="sub">tüm hesaplar buna göre yapılır</span></div>
      <div class="form">
        <label class="f">Paket fiyatı (TL)<input class="inp num" data-fk="kcPackTL" data-set="kcPackTL" data-num="1" value="${st.kcPackTL ? nfx.format(st.kcPackTL) : ''}" placeholder="örn. 250"></label>
        <label class="f">Paketteki KC<input class="inp num" data-fk="kcPackKC" data-set="kcPackKC" data-num="1" value="${st.kcPackKC ? fmtN(st.kcPackKC) : ''}" placeholder="örn. 2500"></label>
      </div>
      <div class="card-h" style="margin:22px 0 12px"><h3>PUS mu, pazar mı?</h3></div>
      <div class="form">
        <label class="f">PUS fiyatı (KC)<input class="inp num" data-fk="pc-kc" data-bind-pc="kc" value="${esc(pc.kc)}" placeholder="örn. 450"></label>
        <label class="f">Adet<input class="inp num" data-fk="pc-qty" data-bind-pc="qty" value="${esc(pc.qty)}"></label>
        <label class="f full">Aynı itemin pazar fiyatı (noah, birim)<input class="inp num" data-fk="pc-market" data-bind-pc="market" value="${esc(pc.market)}" placeholder="örn. 15m"></label>
      </div>
      <div class="kv" style="margin:16px 0">
        <span class="k">PUS'tan maliyet</span><span class="v">${fmtTL(k ? pusCost : null)}</span>
        <span class="k">Pazardan maliyet</span><span class="v">${fmtTL(pm ? mktTL : null)}</span>
        <span class="k">PUS maliyetinin noah karşılığı</span><span class="v">${k && st.gbTL ? fmtN(noahOfTL(pusCost)) : '—'}</span>
      </div>
      ${verdict || (!st.gbTL ? '<div class="callout">Karşılaştırma için İnternet Verisi sayfasından 1 GB fiyatını girin.</div>' : '')}
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="card-h" style="padding:18px 18px 0"><h3>PUS alımları</h3><button class="btn pri sm" data-act="pus-add">${ICON.plus} Alım ekle</button></div>
      ${buys.length ? `<div class="tbl-wrap" style="border:0;border-radius:0;border-top:1px solid var(--line)"><table>
        <thead><tr><th>Tarih</th><th>Item</th><th class="num">KC</th><th class="num">Adet</th><th class="num">TL</th><th></th></tr></thead>
        <tbody>${buys.map(b => `<tr><td class="mut">${fmtDate(b.date)}</td><td>${esc(b.item)}</td><td class="num">${fmtN(b.kc)}</td><td class="num">${fmtN(b.qty)}</td><td class="num">${fmtTL(pusTL(b))}</td><td>${actBtns('pus', b.id)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div style="padding:18px">${empty('Alım yok', 'PUS alımları aylık giderinize otomatik eklenir.')}</div>`}
    </div>
  </div>`;
};
function pusForm(b) {
  const isNew = !b;
  b = b || { id: uid(), date: localDate(), item: '', kc: 0, qty: 1 };
  openForm({
    title: isNew ? 'PUS alımı' : 'Düzenle: ' + b.item,
    data: { ...b },
    fields: [
      { k: 'item', label: 'Item', type: 'text', full: true, placeholder: 'örn. Premium, Scroll' },
      { k: 'kc', label: 'Birim fiyat (KC)', type: 'number' },
      { k: 'qty', label: 'Adet', type: 'number' },
      { k: 'date', label: 'Tarih', type: 'date' },
    ],
    onSave: v => {
      if (!v.item.trim() || !parseNum(v.kc)) { toast('Item ve KC fiyatı girin.', 'err'); return false; }
      Object.assign(b, { item: v.item.trim(), kc: parseNum(v.kc), qty: Math.max(1, Math.round(parseNum(v.qty))), date: v.date || localDate() });
      if (isNew) S.pus.buys.push(b);
      if (!kcTL()) toast('Not: KC paket fiyatı girilmediği için TL tutarı hesaplanamıyor.');
      save(); render(); toast('Kaydedildi', 'ok');
    },
  });
}

/* ---------- EXP ---------- */
function fmtDur(h) {
  if (!isFinite(h) || h <= 0) return '—';
  const totalMin = Math.round(h * 60);
  const d = Math.floor(totalMin / 1440), hh = Math.floor((totalMin % 1440) / 60), mm = totalMin % 60;
  return [d ? d + ' gün' : '', hh ? hh + ' sa' : '', (!d && mm) ? mm + ' dk' : ''].filter(Boolean).join(' ') || '< 1 dk';
}
VIEWS.exp = () => {
  const c = S.exp.calc;
  const need = parseAmt(c.need) || S.exp.table[c.level] || 0;
  const cur = clamp(parseNum(c.cur), 0, 100), tgt = clamp(parseNum(c.target) || 100, 0, 100);
  const bonus = parseNum(c.bonus);
  const perMob = parseAmt(c.perMob) * (1 + bonus / 100);
  const expHour = parseAmt(c.expHour) ? parseAmt(c.expHour) * (1 + bonus / 100) : perMob * parseNum(c.mobHour);
  const remain = Math.max(0, need * (tgt - cur) / 100);
  const mobs = perMob ? Math.ceil(remain / perMob) : 0;
  const hours = expHour ? remain / expHour : 0;
  const pctHour = need && expHour ? expHour / need * 100 : 0;
  const ses = [...S.exp.sessions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const sesCalc = s => { const dp = (s.endPct - s.startPct); const h = s.minutes / 60; const n = S.exp.table[s.level]; return { dp, ph: h ? dp / h : 0, eh: n && h ? dp / 100 * n / h : 0 }; };
  const last = ses.filter(s => s.level == c.level).slice(0, 10);
  const avgPh = last.length ? sum(last, s => sesCalc(s).dp) / (sum(last, s => s.minutes) / 60 || 1) : 0;
  const tableRows = Object.entries(S.exp.table).sort((a, b) => a[0] - b[0]);
  return `
  <div class="grid g-wide">
    <div class="card">
      <div class="card-h"><h3>Seviye hesaplayıcı</h3><span class="sub">tüm alanlar kısaltma kabul eder (ör. 1,2b · 850k)</span></div>
      <div class="form" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <label class="f">Seviye<input class="inp num" data-fk="e-level" data-exp="level" value="${esc(c.level)}"></label>
        <label class="f">Seviye için gereken EXP<input class="inp num" data-fk="e-need" data-exp="need" value="${esc(c.need)}" placeholder="${S.exp.table[c.level] ? fmtN(S.exp.table[c.level]) + ' (tablodan)' : 'örn. 2,5b'}"></label>
        <label class="f">&nbsp;<button class="btn" data-act="exp-save-level" ${parseAmt(c.need) ? '' : 'disabled'}>Tabloya kaydet</button></label>
        <label class="f">Mevcut %<input class="inp num" data-fk="e-cur" data-exp="cur" value="${esc(c.cur)}"></label>
        <label class="f">Hedef %<input class="inp num" data-fk="e-target" data-exp="target" value="${esc(c.target)}"></label>
        <label class="f">Toplam bonus %<input class="inp num" data-fk="e-bonus" data-exp="bonus" value="${esc(c.bonus)}" title="Premium, scroll, flash vb. toplamı"><span class="hint">premium + scroll + flash</span></label>
        <label class="f">Mob başı EXP<input class="inp num" data-fk="e-pm" data-exp="perMob" value="${esc(c.perMob)}" placeholder="örn. 120k"></label>
        <label class="f">Saatte mob<input class="inp num" data-fk="e-mh" data-exp="mobHour" value="${esc(c.mobHour)}" placeholder="örn. 300"></label>
        <label class="f">veya saatte EXP<input class="inp num" data-fk="e-eh" data-exp="expHour" value="${esc(c.expHour)}" placeholder="doğrudan"></label>
      </div>
      <div style="margin:20px 0 6px" class="row"><span class="mut">İlerleme</span><span class="spacer"></span><b>%${fmtX(cur)}</b><span class="mut">→ %${fmtX(tgt)}</span></div>
      <div class="meter" style="height:12px"><div style="width:${cur}%"></div></div>
      <div class="grid g4" style="margin-top:18px;gap:12px">
        <div class="callout"><div class="hint">Kalan EXP</div><div class="big-result" style="font-size:22px">${need ? fmtShort(remain) : '—'}</div></div>
        <div class="callout"><div class="hint">Kesilecek mob</div><div class="big-result" style="font-size:22px">${mobs ? fmtN(mobs) : '—'}</div></div>
        <div class="callout y"><div class="hint">Tahmini süre</div><div class="big-result gold" style="font-size:22px">${fmtDur(hours)}</div></div>
        <div class="callout"><div class="hint">Saatte ilerleme</div><div class="big-result" style="font-size:22px">${pctHour ? '%' + fmtX(pctHour) : '—'}</div></div>
      </div>
      ${!need ? '<div class="hint" style="margin-top:10px">Seviye için gereken toplam EXP\'yi girin (oyunda %100 için gereken değer). “Tabloya kaydet” derseniz bir dahakine otomatik gelir.</div>' : ''}
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-h"><h3>Oturum kaydı</h3><button class="btn pri sm" data-act="exp-ses-add">${ICON.plus} Oturum</button></div>
        <div class="hint" style="margin-bottom:10px">Kasıl başı ve sonu yüzdenizi girin; gerçek hızınız hesaplanır.</div>
        ${avgPh ? `<div class="callout y" style="margin-bottom:12px">Seviye ${esc(c.level)} ortalaman: <b>saatte %${fmtX(avgPh)}</b> → %${fmtX(cur)}'den %${fmtX(tgt)}'ye <b>${fmtDur((tgt - cur) / avgPh)}</b></div>` : ''}
        ${ses.length ? `<div class="tbl-wrap" style="max-height:300px"><table><thead><tr><th>Tarih</th><th>Lv</th><th class="num">%</th><th class="num">Süre</th><th class="num">%/saat</th><th></th></tr></thead><tbody>
        ${ses.map(s => { const r = sesCalc(s); return `<tr><td class="mut">${fmtDate(s.date)}</td><td>${s.level}</td><td class="num">${fmtX(s.startPct)}→${fmtX(s.endPct)}</td><td class="num">${fmtDur(s.minutes / 60)}</td><td class="num gold">${fmtX(r.ph)}</td><td><button class="icon-btn" data-act="exp-ses-del" data-id="${s.id}" title="Sil">${ICON.del}</button></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="mut">Kayıt yok.</div>'}
      </div>
      <div class="card">
        <div class="card-h"><h3>EXP tablom</h3><span class="sub">${tableRows.length} seviye</span></div>
        ${tableRows.length ? `<div class="tbl-wrap" style="max-height:200px"><table><tbody>${tableRows.map(([lv, v]) => `<tr><td>Seviye ${lv}</td><td class="num">${fmtN(v)}</td><td style="width:40px"><button class="icon-btn" data-act="exp-tbl-del" data-id="${lv}">${ICON.del}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="mut">Henüz kayıtlı seviye yok.</div>'}
      </div>
    </div>
  </div>`;
};

/* ---------- FİYAT LİSTESİ ---------- */
VIEWS.fiyat = () => {
  let list = S.prices.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  if (ui.priceQ) { const q = ui.priceQ.toLocaleLowerCase('tr'); list = list.filter(p => (p.name + ' ' + (p.cat || '')).toLocaleLowerCase('tr').includes(q)); }
  return `
  <div class="row" style="margin-bottom:16px">
    <label class="search" style="width:300px"><input class="inp" placeholder="Item ara" data-fk="priceQ" data-bind-ui="priceQ" value="${esc(ui.priceQ)}"></label>
    <span class="mut">${S.prices.length} item</span>
    <div class="spacer"></div>
    <button class="btn" data-act="csv-price">${ICON.dl} CSV</button>
    <button class="btn pri" data-act="price-add">${ICON.plus} Item ekle</button>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    ${list.length ? `<div class="tbl-wrap" style="border:0;border-radius:0"><table>
      <thead><tr><th>Item</th><th>Kategori</th><th class="num" style="width:190px">Pazar fiyatı (noah)</th><th class="num">TL</th><th class="num">Değişim</th><th>Güncelleme</th><th></th></tr></thead>
      <tbody>${list.map(p => { const prev = (p.hist || []).slice(-2, -1)[0]; const ch = prev && prev.v ? (p.price - prev.v) / prev.v * 100 : null; return `<tr>
        <td><b>${esc(p.name)}</b></td><td class="mut">${esc(p.cat) || '—'}</td>
        <td><input class="inp cell num" data-fk="pr-${p.id}" data-prf="price" data-id="${p.id}" value="${fmtN(p.price)}"></td>
        <td class="num mut">${fmtTL(tlOf(p.price))}</td>
        <td class="num">${ch == null ? '<span class="mut">—</span>' : `<span class="${ch >= 0 ? 'pos' : 'neg'}">${ch >= 0 ? '▲' : '▼'} %${fmtX(Math.abs(ch))}</span>`}</td>
        <td class="mut">${fmtDate(p.updated)}${p.src ? ' <span class="badge b">web</span>' : ''}</td>
        <td>${actBtns('price', p.id)}</td></tr>`; }).join('')}</tbody></table></div>`
    : empty('Fiyat listesi boş', 'Sık işlem yaptığınız itemleri ekleyin. Parti drop girerken değerleri buradan otomatik dolar.')}
  </div>`;
};
function setPrice(p, price, src) {
  if (p.price === price) return;
  p.price = price; p.updated = localDate(); p.src = src || '';
  p.hist = (p.hist || []).concat({ d: p.updated, v: price }).slice(-20);
}
function priceForm(p) {
  const isNew = !p;
  p = p || { id: uid(), name: '', cat: '', price: 0, updated: localDate(), hist: [] };
  openForm({
    title: isNew ? 'Item ekle' : 'Düzenle: ' + p.name,
    data: { ...p, price: p.price ? fmtN(p.price) : '' },
    fields: [
      { k: 'name', label: 'Item adı', type: 'text', full: true },
      { k: 'cat', label: 'Kategori', type: 'text', list: [...new Set(S.prices.map(x => x.cat).filter(Boolean))], placeholder: 'örn. Silah, Zırh, Takı' },
      { k: 'price', label: 'Pazar fiyatı', type: 'money' },
    ],
    onSave: v => {
      if (!v.name.trim()) { toast('Item adı girin.', 'err'); return false; }
      p.name = v.name.trim(); p.cat = v.cat;
      setPrice(p, parseAmt(v.price));
      if (isNew) S.prices.push(p);
      save(); render(); toast('Kaydedildi', 'ok');
    },
  });
}

/* ---------- İNTERNET VERİSİ ---------- */
const TARGETS = () => [['gbTL', '1 GB fiyatı (TL)'], ['kcTL', '1 KC fiyatı (TL)'], ['none', 'Sadece göster']].concat(S.prices.map(p => ['price:' + p.id, 'Fiyat listesi: ' + p.name]));
VIEWS.internet = () => {
  const st = S.settings;
  if (!ui.adm) { ui.adm = {}; FB.getDoc(FB.doc(CLOUD.db, 'kohesapMarket', 'latest')).then(m => { ui.adm.market = m.exists() ? m.data() : null; if (ui.page === 'internet') render(); }).catch(() => { }); }
  return `
  <div class="card" style="margin-bottom:16px;border-color:rgba(227,181,84,.4)">
    <div class="card-h"><div><h3>Veri kaynakları <span class="badge y">admin</span></h3><div class="sub">Burada yaptığın değişiklikler <b>tüm kullanıcılar</b> için geçerli olur; diğer kullanıcılar bu adresleri görmez.</div></div>${CLOUD.global && CLOUD.global.gbUrl ? '<span class="badge g">merkezi ayar kayıtlı</span>' : ''}</div>
    <div class="form">
      <label class="f full">GB fiyat sayfası<input class="inp" data-fk="s-gburl" data-set="gbUrl" value="${esc(st.gbUrl)}"></label>
      <label class="f full">Yedek GB sayfası (ilki açılmazsa)<input class="inp" data-fk="s-gburl2" data-set="gbUrl2" value="${esc(st.gbUrl2)}"></label>
      <label class="f full">Canlı pazar sayfası<input class="inp" data-fk="s-mkurl" data-set="marketUrl" value="${esc(st.marketUrl)}"></label>
      <label class="f full">Event sayfası<input class="inp" data-fk="s-evurl" data-set="eventsUrl" value="${esc(st.eventsUrl)}"></label>
      <label class="f">GB yenileme (dakika)<input class="inp num" data-fk="s-gbr" data-set="gbRefreshMin" data-num="1" value="${st.gbRefreshMin}"></label>
      <label class="f">Pazar yenileme (saniye)<input class="inp num" data-fk="s-mkr" data-set="marketRefreshSec" data-num="1" value="${st.marketRefreshSec}"></label>
      <label class="f">Pazarda en fazla sayfa<input class="inp num" data-fk="s-mkp" data-set="marketMaxPages" data-num="1" value="${st.marketMaxPages || 30}"></label>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn pri" data-act="adm-save-sources" ${ui.admDirty ? '' : 'disabled'}>📢 Herkese kaydet</button>
      ${ui.admDirty ? '<span class="gold">Kaydedilmemiş değişiklik var</span>' : ''}
      <button class="btn" data-act="adm-refresh">${ICON.refresh} Durumu yenile</button>
      <button class="btn" data-act="diag" data-url="${esc(st.marketUrl)}">Canlı pazar teşhisi</button>
      <button class="btn" data-act="diag" data-url="${esc(st.gbUrl)}">GB sayfası teşhisi</button>
      ${serverMode ? '<button class="btn" data-act="mk-rediscover-go">Pazar kaynağını yeniden keşfet</button>' : '<span class="hint">Arka plan veri adreslerini görmek için teşhisi Windows uygulamasında çalıştır.</span>'}
    </div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card">
      <div class="card-h"><h3>Paylaşılan canlı pazar</h3></div>
      ${ui.adm && ui.adm.market ? `<div class="kv"><span class="k">İlan</span><span class="v">${fmtN(ui.adm.market.count)}</span><span class="k">Son paylaşım</span><span class="v">${agoText(Date.now() - ui.adm.market.at)}</span><span class="k">Kaynak</span><span class="v">${esc(ui.adm.market.app || '')}</span></div>` : '<div class="mut">Henüz paylaşım yok. Exe\'de Canlı Pazar açılınca oluşur.</div>'}
    </div>
    <div class="card">
      <div class="card-h"><h3>Yayınlanan içerik</h3></div>
      ${CLOUD.content ? `<div class="kv"><span class="k">Event</span><span class="v">${(CLOUD.content.events || []).length}</span><span class="k">PUS item</span><span class="v">${(CLOUD.content.pusCatalog || []).length}</span><span class="k">Son yayın</span><span class="v">${CLOUD.content.v ? agoText(Date.now() - CLOUD.content.v) : '—'}</span></div>` : '<div class="mut">Henüz yayın yok. Event Takvimi ve PUS Hesabı sayfalarındaki “Herkese yayınla” ile gönderebilirsin.</div>'}
    </div>
    <div class="card">
      <div class="card-h"><h3>Merkezi kaynak ayarı</h3></div>
      ${CLOUD.global && CLOUD.global.gbUrl ? '<div class="kv"><span class="k">Durum</span><span class="v pos">kayıtlı</span><span class="k">Kapsam</span><span class="v">tüm kullanıcılar</span></div>' : '<div class="mut">Henüz kaydedilmedi; kullanıcılar varsayılan adresleri kullanıyor. Yukarıdaki bir alanı değiştirince kaydedilir.</div>'}
    </div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card">
      <div class="card-h"><h3>1 GB fiyatı</h3><span class="sub">${st.gbTime ? 'güncelleme: ' + esc(st.gbTime) : ''}</span></div>
      <label class="f">1 Gold Bar = TL<input class="inp num" data-fk="gbTL" data-set="gbTL" data-num="1" value="${st.gbTL ? nf2.format(st.gbTL) : ''}" placeholder="elle girin veya kaynaktan çekin"></label>
      <div class="hint" style="margin-top:8px">1 GB = ${fmtN(st.gbNoah)} noah (Ayarlar'dan değiştirilebilir). Tüm TL dönüşümleri bu değeri kullanır.</div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Döviz kurları</h3><button class="btn sm" data-act="rates">${ICON.refresh} Güncelle</button></div>
      <div class="kv">
        <span class="k">USD / TRY</span><span class="v">${st.usdTL ? nf2.format(st.usdTL) : '—'}</span>
        <span class="k">EUR / TRY</span><span class="v">${st.eurTL ? nf2.format(st.eurTL) : '—'}</span>
        <span class="k">1 GB (USD)</span><span class="v">${st.gbTL && st.usdTL ? '$' + nf2.format(st.gbTL / st.usdTL) : '—'}</span>
      </div>
      <div class="hint" style="margin-top:10px">${st.ratesTime ? 'Son güncelleme: ' + esc(st.ratesTime) : 'Kaynak: open.er-api.com'}</div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Otomatik güncelleme</h3></div>
      <div class="stack" style="gap:10px">
        <label class="check"><input type="checkbox" data-set-check="autoRates" ${st.autoRates ? 'checked' : ''}> Açılışta kurları güncelle</label>
        <label class="check"><input type="checkbox" data-set-check="autoSources" ${st.autoSources ? 'checked' : ''}> Açılışta tüm web kaynaklarını çek</label>
        <button class="btn" data-act="src-all" ${S.sources.length ? '' : 'disabled'}>${ICON.refresh} Tüm kaynakları şimdi çek</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-h"><div><h3>Web kaynakları</h3><div class="sub">Herhangi bir sitedeki fiyatı çekip GB fiyatına, KC fiyatına veya fiyat listenizdeki bir iteme yazar.</div></div><button class="btn pri" data-act="src-add">${ICON.plus} Kaynak ekle</button></div>
    ${S.sources.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Ad</th><th>Adres</th><th>Hedef</th><th class="num">Son değer</th><th>Son çekim</th><th></th></tr></thead>
      <tbody>${S.sources.map(s => `<tr>
        <td><b>${esc(s.name)}</b>${s.keyword ? `<div class="hint">anahtar: ${esc(s.keyword)}</div>` : ''}</td>
        <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.url)}">${esc(s.url)}</td>
        <td>${esc((TARGETS().find(t => t[0] === s.target) || [, s.target])[1])}</td>
        <td class="num">${s.last && s.last.ok ? '<b>' + nfx.format(s.last.val) + '</b>' : s.last ? '<span class="neg" title="' + esc(s.last.err) + '">hata</span>' : '<span class="mut">—</span>'}</td>
        <td class="mut">${s.last ? esc(s.last.time) : '—'}</td>
        <td>${actBtns('src', s.id, `<button class="icon-btn" title="Şimdi çek" data-act="src-run" data-id="${s.id}">${ICON.refresh}</button>`)}</td></tr>`).join('')}</tbody></table></div>`
    : empty('Henüz kaynak yok', 'Örneğin GB satılan bir sitenin adresini ekleyin, sayfadan fiyatı seçin; program her açılışta güncel fiyatı çeksin.')}
    <div class="callout" style="margin-top:14px">Not: Bazı siteler fiyatları sayfa açıldıktan sonra JavaScript ile yükler veya bot korumasına sahiptir; bu sitelerden veri çekilemeyebilir. O durumda değeri elle girebilirsiniz.</div>
  </div>`;
};

// sayfadaki fiyat benzeri sayıları bulur
const PRICE_RE = /(?:₺\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:TL|₺|TRY)|₺\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi;
function extractValues(text, src) {
  let hay = text;
  if (src.keyword) {
    const i = hay.toLocaleLowerCase('tr').indexOf(src.keyword.toLocaleLowerCase('tr'));
    if (i < 0) return { vals: [], err: `“${src.keyword}” sayfada bulunamadı.` };
    hay = hay.slice(i, i + (src.window || 400));
  }
  const vals = [];
  if (src.regex) {
    let re; try { re = new RegExp(src.regex, 'gi'); } catch (e) { return { vals: [], err: 'Regex hatalı: ' + e.message }; }
    for (const m of hay.matchAll(re)) { const v = parseNum(m[1] ?? m[0]); if (v) vals.push(v); if (vals.length > 200) break; }
  } else {
    for (const m of hay.matchAll(PRICE_RE)) { const v = parseNum(m[1] || m[2]); if (v) vals.push(v); if (vals.length > 200) break; }
  }
  return { vals, err: vals.length ? '' : 'Sayfada fiyat bulunamadı.' };
}
function pickValue(vals, mode, idx) {
  if (!vals.length) return 0;
  switch (mode) {
    case 'min': return Math.min(...vals);
    case 'max': return Math.max(...vals);
    case 'avg': return sum(vals) / vals.length;
    case 'idx': return vals[clamp((idx || 1) - 1, 0, vals.length - 1)];
    default: return vals[0];
  }
}
async function fetchPage(url) {
  const r = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  if (!r.ok) throw new Error('Sunucu hatası');
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Çekilemedi');
  return d;
}
function applySource(s, val) {
  const v = val / (s.divide || 1);
  if (s.target === 'gbTL') { S.settings.gbTL = v; S.settings.gbTime = new Date().toLocaleString('tr-TR'); }
  else if (s.target === 'kcTL') { S.settings.kcPackTL = v; S.settings.kcPackKC = 1; }
  else if (s.target.startsWith('price:')) { const p = S.prices.find(x => x.id === s.target.slice(6)); if (p) setPrice(p, Math.round(v), s.name); }
  return v;
}
async function runSource(s, quiet) {
  try {
    const d = await fetchPage(s.url);
    const { vals, err } = extractValues(d.text, s);
    if (!vals.length) throw new Error(err);
    const v = applySource(s, pickValue(vals, s.mode, s.idx));
    s.last = { ok: true, val: v, time: new Date().toLocaleString('tr-TR') };
    if (!quiet) toast(`${s.name}: ${nfx.format(v)}`, 'ok');
  } catch (e) {
    s.last = { ok: false, err: e.message, time: new Date().toLocaleString('tr-TR') };
    if (!quiet) toast(`${s.name}: ${e.message}`, 'err');
  }
  save(); render();
}
async function updateRates(quiet) {
  try {
    const d = await (await fetch(serverMode ? '/api/rates' : '/api/kohesap/rates')).json();
    if (!d.ok) throw new Error(d.error);
    S.settings.usdTL = d.USD; S.settings.eurTL = d.EUR; S.settings.ratesTime = new Date().toLocaleString('tr-TR');
    save(); render(); if (!quiet) toast('Kurlar güncellendi', 'ok');
  } catch (e) { if (!quiet) toast('Kur alınamadı: ' + e.message, 'err'); }
}
function sourceForm(s) {
  const isNew = !s;
  s = s || { id: uid(), name: '', url: '', keyword: '', regex: '', mode: 'first', idx: 1, divide: 1, target: 'gbTL', window: 400 };
  openForm({
    title: isNew ? 'Web kaynağı ekle' : 'Düzenle: ' + s.name,
    wide: true,
    data: { ...s },
    fields: [
      { k: 'name', label: 'Ad', type: 'text', placeholder: 'örn. GB fiyatı – Site A' },
      { k: 'target', label: 'Değer nereye yazılsın?', type: 'select', options: TARGETS() },
      { k: 'url', label: 'Sayfa adresi', type: 'text', full: true, placeholder: 'https://…' },
      { k: 'keyword', label: 'Anahtar kelime (isteğe bağlı)', type: 'text', placeholder: 'örn. Pandora', hint: 'Fiyat bu kelimeden sonra aranır' },
      { k: 'mode', label: 'Birden fazla fiyat varsa', type: 'select', options: [['first', 'İlkini al'], ['min', 'En düşüğü'], ['max', 'En yükseği'], ['avg', 'Ortalaması'], ['idx', 'Belirli sıradakini']] },
      { k: 'idx', label: 'Sıra no (belirli sıra için)', type: 'number' },
      { k: 'divide', label: 'Bölen', type: 'number', hint: 'Fiyat 10 GB içinse 10 yazın' },
      { k: 'regex', label: 'Gelişmiş: regex (isteğe bağlı)', type: 'text', full: true, placeholder: 'örn. Pandora[^0-9]*([0-9.,]+)', hint: 'İlk grup () değer olarak alınır. Boş bırakırsanız TL/₺ yazan fiyatlar otomatik bulunur.' },
    ],
    extra: `<div style="margin-top:16px"><button class="btn" data-act="src-test">${ICON.refresh} Sayfayı getir ve test et</button><div id="srcTest" style="margin-top:12px"></div></div>`,
    onSave: v => {
      if (!/^https?:\/\//i.test(v.url.trim())) { toast('Adres http:// veya https:// ile başlamalı.', 'err'); return false; }
      Object.assign(s, { name: v.name.trim() || new URL(v.url).hostname, url: v.url.trim(), keyword: v.keyword.trim(), regex: v.regex.trim(), mode: v.mode, idx: Math.max(1, Math.round(parseNum(v.idx))), divide: parseNum(v.divide) || 1, target: v.target });
      if (isNew) S.sources.push(s);
      save(); render(); toast('Kaynak kaydedildi', 'ok');
    },
  });
}
async function testSourceForm() {
  const v = readForm();
  const box = $('#srcTest');
  box.innerHTML = '<span class="mut">Sayfa getiriliyor…</span>';
  try {
    const d = await fetchPage(v.url.trim());
    const src = { keyword: v.keyword.trim(), regex: v.regex.trim(), mode: v.mode, idx: parseNum(v.idx) };
    const { vals, err } = extractValues(d.text, src);
    const picked = pickValue(vals, src.mode, src.idx) / (parseNum(v.divide) || 1);
    box.innerHTML = vals.length
      ? `<div class="callout y" style="margin-bottom:10px">Seçilen değer: <b>${nfx.format(picked)}</b> (${vals.length} fiyat bulundu)</div>
         <div class="hint" style="margin-bottom:6px">Bulunan fiyatlar (tıklayınca “belirli sıradaki” olarak seçilir):</div>
         <div class="found">${vals.slice(0, 60).map((x, i) => `<button type="button" data-act="src-pick" data-i="${i + 1}">${i + 1}. ${nfx.format(x)}</button>`).join('')}</div>`
      : `<div class="callout">${esc(err)}</div><div class="hint" style="margin:10px 0 6px">Sayfa metni (ilk kısım):</div><div class="pre">${esc(d.text.slice(0, 3000))}</div>`;
  } catch (e) { box.innerHTML = `<div class="callout"><span class="neg">${esc(e.message)}</span></div>`; }
}

/* ---------- AYARLAR ---------- */
VIEWS.ayar = () => {
  const st = S.settings;
  return `
  <div class="grid g2">
    <div class="card">
      <div class="card-h"><h3>Karakter ve oranlar</h3><button class="btn sm" data-act="char-edit-cur">${ICON.edit} Karakteri düzenle</button></div>
      ${CUR.ch ? `<div class="transfer" style="margin-bottom:14px">${charEmblem(CUR.ch, 40)}<div><b>${esc(CUR.ch.name)}</b><div class="hint">${esc(charLine(CUR.ch))}</div></div><span class="spacer"></span><button class="btn sm ghost" data-act="char-select">Karakter değiştir</button></div>` : ''}
      <div class="form">
        <label class="f">Sunucu${S.gbMarket ? `<select class="inp" data-set="server">${S.gbMarket.servers.map(x => `<option ${x === st.server ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : `<input class="inp" data-fk="s-srv" data-set="server" value="${esc(st.server)}" placeholder="örn. Zero, Pandora">`}<span class="hint">GB fiyatı bu sunucudan alınır</span></label>
        <label class="f">1 GB kaç noah?<input class="inp num" data-fk="s-gbn" data-set="gbNoah" data-money="1" value="${fmtN(st.gbNoah)}"><span class="hint">Varsayılan 100.000.000</span></label>
        <label class="f">1 GB fiyatı (TL)<input class="inp num" data-fk="s-gbtl" data-set="gbTL" data-num="1" value="${st.gbTL ? nf2.format(st.gbTL) : ''}"></label>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Google hesabı</h3><span class="badge g">senkron açık</span></div>
      <div class="row" style="margin-bottom:14px">${CLOUD.user && CLOUD.user.photoURL ? `<img src="${esc(CLOUD.user.photoURL)}" width="40" height="40" style="border-radius:50%" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(CUR.acc ? (CUR.acc.name || CUR.acc.user) : '')}</b><div class="hint">${esc(CUR.acc ? CUR.acc.user : '')} · ${CUR.acc ? CUR.acc.chars.length : 0} / 4 karakter</div></div></div>
      <div class="row"><button class="btn" data-act="logout">Çıkış yap</button><button class="btn danger" data-act="acc-del">${ICON.del} KO Hesap verilerimi sil</button></div>
      <div class="hint" style="margin-top:10px">Kayıtların Google hesabına bağlı olarak saklanır; ${serverMode ? 'web sürümünde (forgeandplay.com/tr/kohesap)' : 'Windows uygulamasında'} aynı hesapla girince hepsi gelir.</div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Bildirim ve güncelleme</h3></div>
      <div class="form">

        <label class="f">Event hatırlatma (dk önce)<input class="inp num" data-fk="s-evn" data-set="eventNotifyMin" data-num="1" value="${st.eventNotifyMin}"></label>
        <label class="f" style="justify-content:flex-end"><span class="check"><input type="checkbox" data-set-check="gbAuto" ${st.gbAuto ? 'checked' : ''}> GB fiyatını otomatik güncelle</span></label>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Kategoriler</h3></div>
      <div class="form">
        <label class="f full">Gelir kategorileri (virgülle)<textarea class="inp" rows="2" data-cats="catsIn">${esc(st.catsIn.join(', '))}</textarea></label>
        <label class="f full">Gider kategorileri (virgülle)<textarea class="inp" rows="2" data-cats="catsOut">${esc(st.catsOut.join(', '))}</textarea></label>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Yedekleme</h3></div>
      <div class="hint" style="margin-bottom:12px">Asıl kayıt Google hesabındadır. ${serverMode ? `Bu bilgisayarda ayrıca bir kopya tutulur: <span class="mono">${esc(ui.dataDir || '')}</span> (her gün otomatik yedek, son 30 gün).` : 'İstersen buradan yedek dosyası da indirebilirsin.'}</div>
      <div class="row">
        <button class="btn" data-act="export">${ICON.dl} Yedeği indir (.json)</button>
        <button class="btn" data-act="import">${ICON.up} Yedekten geri yükle</button>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Tehlikeli bölge</h3></div>
      <div class="row">
        <button class="btn" data-act="demo">Örnek veri yükle</button>
        <button class="btn danger" data-act="reset">${ICON.del} Tüm veriyi sil</button>
        ${serverMode ? '<button class="btn ghost" data-act="quit">Programı kapat</button>' : ''}
      </div>
      <div class="hint" style="margin-top:10px">Örnek veri, programı tanımak için birkaç kayıt ekler (mevcut verinin üzerine yazar).</div>
    </div>
  </div>`;
};

/* ==========================================================================
   MODAL FORM
   ========================================================================== */
let formCtx = null;
function openForm({ title, fields, data, onSave, extra, wide }) {
  formCtx = { fields, onSave };
  $('#modalTitle').textContent = title;
  $('.modal').style.width = wide ? 'min(780px,100%)' : '';
  const field = f => {
    const v = data[f.k] ?? '';
    const lst = f.list ? ` list="fl-${f.k}"` : '';
    let inp;
    if (f.type === 'select') inp = `<select class="inp" name="${f.k}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') inp = `<textarea class="inp" name="${f.k}" rows="3">${esc(v)}</textarea>`;
    else if (f.type === 'date') inp = `<input class="inp" type="date" name="${f.k}" value="${esc(v)}">`;
    else inp = `<input class="inp ${f.type === 'money' || f.type === 'number' ? 'num' : ''}" type="${f.type === 'password' ? 'password' : 'text'}" name="${f.k}" value="${esc(f.type === 'number' && v !== '' ? fmtX(v) : v)}" placeholder="${esc(f.placeholder || (f.type === 'money' ? 'örn. 50m' : ''))}" autocomplete="off"${lst} ${f.type === 'money' ? `data-money-prev="${f.k}"` : ''}>`;
    return `<label class="f ${f.full ? 'full' : ''}">${f.label}${inp}${f.type === 'money' ? `<span class="hint" id="prev-${f.k}"></span>` : f.hint ? `<span class="hint">${f.hint}</span>` : ''}${f.list ? `<datalist id="fl-${f.k}">${f.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</label>`;
  };
  $('#modalBody').innerHTML = `<form class="form" id="mform" onsubmit="return false">${fields.map(field).join('')}</form>${extra || ''}`;
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="modal-close">Vazgeç</button><button class="btn pri" data-act="modal-save">Kaydet</button>`;
  $('#modalBack').hidden = false;
  updateMoneyPreviews();
  setTimeout(() => { const f = $('#mform input:not([type=date]), #mform select'); f && f.focus(); }, 30);
}
function readForm() {
  const v = {};
  formCtx.fields.forEach(f => { const el = $('#mform [name="' + f.k + '"]'); v[f.k] = el ? el.value : ''; });
  return v;
}
function updateMoneyPreviews() {
  if (!formCtx) return;
  const v = readForm();
  formCtx.fields.filter(f => f.type === 'money').forEach(f => {
    const el = $('#prev-' + f.k); if (!el) return;
    if (f.unitField && v[f.unitField] === 'tl') { const n = noahOfTL(parseNum(v[f.k])); el.textContent = n != null && parseNum(v[f.k]) ? `= ${fmtTL(parseNum(v[f.k]))} · ${fmtN(n)} noah` : 'TL olarak girin, ör. 125,50'; }
    else el.textContent = amtPreview(parseAmt(v[f.k]));
  });
}
function closeModal() { $('#modalBack').hidden = true; formCtx = null; }
function confirmBox(title, msg, yesText, onYes) {
  formCtx = { fields: [], onSave: () => { onYes(); } };
  $('#modalTitle').textContent = title;
  $('.modal').style.width = '';
  $('#modalBody').innerHTML = `<p style="margin:0;color:var(--tx2)">${msg}</p>`;
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="modal-close">Vazgeç</button><button class="btn pri" data-act="modal-save">${yesText}</button>`;
  $('#modalBack').hidden = false;
}

/* ==========================================================================
   OLAYLAR
   ========================================================================== */
const curParty = () => S.parties.find(p => p.id === ui.partyId);
function addDrop() {
  const p = curParty(); if (!p) return;
  const nd = ui.newDrop;
  if (!nd.item.trim()) { toast('Item adı girin.', 'err'); return; }
  let value = parseAmt(nd.value);
  const pr = S.prices.find(x => x.name.toLocaleLowerCase('tr') === nd.item.trim().toLocaleLowerCase('tr'));
  if (!value && pr) value = pr.price;
  p.drops.push({ id: uid(), item: nd.item.trim(), qty: Math.max(1, Math.round(parseNum(nd.qty))), value, looter: nd.looter, sold: false, soldPrice: 0 });
  ui.newDrop = { item: '', qty: '1', value: '', looter: nd.looter };
  save(); render();
  const el = document.querySelector('[data-fk="nd-item"]'); el && el.focus();
}

function csv(name, head, rows) {
  const q = x => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  download(name, txt, 'text/csv;charset=utf-8');
}
function download(name, txt, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const ACTIONS = {
  go: el => { ui.page = el.dataset.id; document.body.classList.remove('nav-open'); closeModal(); render(); $('#content').scrollTop = 0; window.scrollTo(0, 0); },
  'nav-toggle': () => document.body.classList.toggle('nav-open'),
  'adm-save-sources': () => confirmBox('Veri kaynaklarını kaydet', 'Bu adresler <b>tüm kullanıcıların</b> uygulamasında kullanılacak. Kaydedilsin mi?', 'Herkese kaydet', () => saveGlobalConfig().then(() => { ui.admDirty = false; render(); toast('Tüm kullanıcılar için kaydedildi', 'ok'); }).catch(e => toast('Kaydedilemedi: ' + e.message, 'err'))),
  'adm-refresh': async () => {
    try {
      const m = await FB.getDoc(FB.doc(CLOUD.db, 'kohesapMarket', 'latest'));
      const c = await FB.getDoc(FB.doc(CLOUD.db, 'config', 'kohesapContent'));
      ui.adm = { market: m.exists() ? m.data() : null }; if (c.exists()) CLOUD.content = c.data();
      render(); toast('Durum güncellendi', 'ok');
    } catch (e) { toast('Okunamadı: ' + e.message, 'err'); }
  },
  'nav-close': () => document.body.classList.remove('nav-open'),
  'month-prev': () => { ui.month = addMonth(ui.month, -1); ui.allMonths = false; render(); },
  'month-next': () => { ui.month = addMonth(ui.month, 1); ui.allMonths = false; render(); },
  set: el => { ui[el.dataset.k] = el.dataset.v; render(); },
  'modal-close': closeModal,
  'modal-save': () => { if (!formCtx) return; const r = formCtx.onSave(readForm()); if (r !== false) closeModal(); },
  // kasa
  'tx-add': el => txForm(null, el.dataset.type),
  'tx-edit': el => txForm(S.tx.find(t => t.id === el.dataset.id)),
  'tx-del': el => confirmBox('Kaydı sil', 'Bu gelir/gider kaydı silinsin mi?', 'Sil', () => { S.tx = S.tx.filter(t => t.id !== el.dataset.id); save(); render(); }),
  'csv-tx': () => csv('gelir-gider.csv', ['Tarih', 'Tür', 'Kategori', 'Açıklama', 'Birim', 'Tutar', 'Noah', 'TL'],
    S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.type, t.cat, t.desc, t.unit, t.amount, txNoah(t), txTL(t) == null ? '' : txTL(t).toFixed(2).replace('.', ',')])),
  // ticaret
  'tr-add': () => tradeForm(null),
  'tr-edit': el => tradeForm(S.trades.find(t => t.id === el.dataset.id)),
  'tr-sell': el => tradeForm(S.trades.find(t => t.id === el.dataset.id), 'sell'),
  'tr-del': el => confirmBox('İşlemi sil', 'Bu ticaret kaydı silinsin mi?', 'Sil', () => { S.trades = S.trades.filter(t => t.id !== el.dataset.id); save(); render(); }),
  'csv-tr': () => csv('ticaret.csv', ['Item', 'Adet', 'Alış', 'Alış tarihi', 'Satış', 'Satış tarihi', 'Komisyon %', 'Durum', 'Kâr', 'Getiri %'],
    S.trades.map(t => { const c = tradeCalc(t); return [t.item, t.qty, t.buyPrice, t.buyDate, t.sellPrice, t.sellDate, t.feePct, t.status, t.status === 'satildi' ? Math.round(c.profit) : '', t.status === 'satildi' ? c.roi.toFixed(2).replace('.', ',') : '']; })),
  // parti
  'party-new': newParty,
  'party-pick': el => { ui.partyId = el.dataset.id; render(); },
  'party-status': el => { curParty().status = el.dataset.v; save(); render(); },
  'party-del': () => confirmBox('Partiyi sil', 'Bu parti ve tüm drop kayıtları silinsin mi?', 'Sil', () => { S.parties = S.parties.filter(p => p.id !== ui.partyId); ui.partyId = null; save(); render(); }),
  'party-copy': async () => { const t = partySummaryText(curParty()); try { await navigator.clipboard.writeText(t); toast('Özet panoya kopyalandı', 'ok'); } catch { download('parti-ozet.txt', t, 'text/plain'); } },
  'member-add': () => { const p = curParty(); p.members.push({ id: uid(), name: 'Üye ' + (p.members.length + 1), weight: 1, me: false }); save(); render(); },
  'member-del': el => { const p = curParty(); if (p.members.length <= 1) return; p.members = p.members.filter(m => m.id !== el.dataset.id); p.drops.forEach(d => { if (d.looter === el.dataset.id) d.looter = ''; }); if (p.leaderId === el.dataset.id) p.leaderId = ''; save(); render(); },
  'member-me': el => { curParty().members.forEach(m => m.me = m.id === el.dataset.id); save(); render(); },
  'drop-add': addDrop,
  'drop-del': el => { const p = curParty(); p.drops = p.drops.filter(d => d.id !== el.dataset.id); save(); render(); },
  // pus
  'pus-add': () => pusForm(null),
  'pus-edit': el => pusForm(S.pus.buys.find(b => b.id === el.dataset.id)),
  'pus-del': el => { S.pus.buys = S.pus.buys.filter(b => b.id !== el.dataset.id); save(); render(); },
  // exp
  'exp-save-level': () => { const c = S.exp.calc; const n = parseAmt(c.need); if (!n) return; S.exp.table[c.level] = n; c.need = ''; save(); render(); toast(`Seviye ${c.level} kaydedildi`, 'ok'); },
  'exp-tbl-del': el => { delete S.exp.table[el.dataset.id]; save(); render(); },
  'exp-ses-add': () => openForm({
    title: 'EXP oturumu', data: { date: localDate(), level: S.exp.calc.level, startPct: S.exp.calc.cur, endPct: '', minutes: 60 },
    fields: [{ k: 'date', label: 'Tarih', type: 'date' }, { k: 'level', label: 'Seviye', type: 'number' }, { k: 'startPct', label: 'Başlangıç %', type: 'number' }, { k: 'endPct', label: 'Bitiş %', type: 'number' }, { k: 'minutes', label: 'Süre (dakika)', type: 'number', full: true }],
    onSave: v => {
      const s = { id: uid(), date: v.date, level: Math.round(parseNum(v.level)), startPct: parseNum(v.startPct), endPct: parseNum(v.endPct), minutes: parseNum(v.minutes) };
      if (!s.minutes || s.endPct <= s.startPct) { toast('Süre ve bitiş yüzdesini kontrol edin.', 'err'); return false; }
      S.exp.sessions.push(s); S.exp.calc.cur = s.endPct; save(); render();
    },
  }),
  'exp-ses-del': el => { S.exp.sessions = S.exp.sessions.filter(s => s.id !== el.dataset.id); save(); render(); },
  // fiyat
  'price-add': () => priceForm(null),
  'price-edit': el => priceForm(S.prices.find(p => p.id === el.dataset.id)),
  'price-del': el => confirmBox('Item sil', 'Bu item fiyat listesinden silinsin mi?', 'Sil', () => { S.prices = S.prices.filter(p => p.id !== el.dataset.id); save(); render(); }),
  'csv-price': () => csv('fiyat-listesi.csv', ['Item', 'Kategori', 'Fiyat', 'Güncelleme'], S.prices.map(p => [p.name, p.cat, p.price, p.updated])),
  // internet
  rates: () => updateRates(false),
  'src-add': () => sourceForm(null),
  'src-edit': el => sourceForm(S.sources.find(s => s.id === el.dataset.id)),
  'src-del': el => confirmBox('Kaynağı sil', 'Bu web kaynağı silinsin mi?', 'Sil', () => { S.sources = S.sources.filter(s => s.id !== el.dataset.id); save(); render(); }),
  'src-run': el => { toast('Çekiliyor…'); runSource(S.sources.find(s => s.id === el.dataset.id)); },
  'src-all': async () => { toast('Tüm kaynaklar çekiliyor…'); for (const s of S.sources) await runSource(s, true); toast('Kaynaklar güncellendi', 'ok'); },
  'src-test': testSourceForm,
  'src-pick': el => { $('#mform [name=mode]').value = 'idx'; $('#mform [name=idx]').value = el.dataset.i; testSourceForm(); },
  // ayarlar
  export: () => download('kohesap-yedek-' + localDate() + '.json', JSON.stringify(S, null, 1), 'application/json'),
  import: () => $('#importFile').click(),
  reset: () => confirmBox('Karakter kayıtlarını sil', `<b>${esc(CUR.ch.name)}</b> karakterinin tüm kayıtları (gelir/gider, ticaret, parti, PUS, EXP) silinecek. Emin misiniz? (Günlük yedekler klasörde kalır.)`, 'Evet, sil', () => { CUR.ch.data = newCharData(CUR.ch.level); bindView(); save(); render(); }),
  demo: () => confirmBox('Örnek veri', `<b>${esc(CUR.ch.name)}</b> karakterinin kayıtlarının yerine örnek veri yüklensin mi?`, 'Yükle', () => {
    const d = demoState(); CUR.ch.data = charDataFrom(d);
    const st = S.settings; if (!st.gbTL) st.gbTL = d.settings.gbTL; if (!st.kcPackTL) { st.kcPackTL = d.settings.kcPackTL; st.kcPackKC = d.settings.kcPackKC; }
    if (!S.prices.length) S.prices = d.prices;
    bindView(); ui.partyId = null; save(); render();
  }),
  quit: () => { fetch('/api/quit').finally(() => { document.body.innerHTML = '<div class="empty" style="margin-top:20vh"><b>KO Hesap kapatıldı</b>Bu pencereyi kapatabilirsiniz.</div>'; window.close(); }); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.type === 'checkbox' || el.type === 'radio') return; // change ile işlenir
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el);
});
$('#modalBack').addEventListener('mousedown', e => { if (e.target.id === 'modalBack') closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modalBack').hidden) closeModal();
  if (e.key === 'Enter' && formCtx && e.target.closest('#mform') && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); ACTIONS['modal-save'](); }
  if (e.key === 'Enter' && e.target.dataset.nd) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); addDrop(); }
});

// anlık yazım (filtreler ve hesaplayıcılar)
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (t.closest('#mform')) { updateMoneyPreviews(); return; }
  if (d.bindUi) { ui[d.bindUi] = t.value; render(); }
  else if (d.bindQ) { ui.quick[d.bindQ] = t.value; render(); }
  else if (d.bindPc) { ui.pc[d.bindPc] = t.value; render(); }
  else if (d.exp) { S.exp.calc[d.exp] = d.exp === 'level' ? Math.round(parseNum(t.value)) || t.value : t.value; save(); render(); }
  else if (d.nd) { ui.newDrop[d.nd] = t.value; if (d.nd === 'item') { const pr = S.prices.find(x => x.name.toLocaleLowerCase('tr') === t.value.trim().toLocaleLowerCase('tr')); if (pr && !ui.newDrop.value) { ui.newDrop.value = fmtN(pr.price); render(); } } }
});
// kalıcı alanlar (değişince kaydet)
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.closest('#mform')) { updateMoneyPreviews(); return; }
  if (t.id === 'importFile') return importFile(t);
  if (d.act === 'toggle-all') { ui.allMonths = t.checked; render(); return; }
  if (d.act === 'member-me') return ACTIONS['member-me'](t);
  const val = () => d.money ? parseAmt(t.value) : d.num ? parseNum(t.value) : t.value;
  if (d.set && typeof GLOBAL_KEYS !== 'undefined' && GLOBAL_KEYS.includes(d.set)) {
    if (!(typeof isAdmin === 'function' && isAdmin())) return;
    S.settings[d.set] = val();
    if (d.set === 'marketUrl') S.settings.marketApi = null;
    ui.admDirty = true; save(); render();
    return;
  }
  if (d.set) { S.settings[d.set] = val(); if (d.set === 'gbTL') S.settings.gbTime = new Date().toLocaleString('tr-TR'); if (d.set === 'gbNoah' && !S.settings.gbNoah) S.settings.gbNoah = 1e8; if (d.set === 'server' && typeof applyGB === 'function') applyGB(); save(); render(); }
  else if (d.setCheck) { S.settings[d.setCheck] = t.checked; save(); }
  else if (d.cats) { S.settings[d.cats] = t.value.split(',').map(x => x.trim()).filter(Boolean); save(); }
  else if (d.pf) { const p = curParty(); p[d.pf] = val(); save(); render(); }
  else if (d.mf) { const m = curParty().members.find(x => x.id === d.id); m[d.mf] = d.mf === 'weight' ? Math.max(0, parseNum(t.value)) : t.value; save(); render(); }
  else if (d.df) {
    const dr = curParty().drops.find(x => x.id === d.id);
    if (d.df === 'sold') dr.sold = t.checked;
    else if (d.df === 'qty') dr.qty = Math.max(1, Math.round(parseNum(t.value)));
    else if (d.df === 'value' || d.df === 'soldPrice') dr[d.df] = parseAmt(t.value);
    else dr[d.df] = t.value;
    save(); render();
  }
  else if (d.nd === 'looter') { ui.newDrop.looter = t.value; }
  else if (d.prf) { setPrice(S.prices.find(x => x.id === d.id), parseAmt(t.value)); save(); render(); }
});

function importFile(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !(d.settings || d.shared)) throw new Error('KO Hesap yedeği değil');
      if (d.v === 2) confirmBox('Yedekten yükle', `“${esc(f.name)}” tam yedektir; <b>karakterlerin ve ortak ayarların</b> bu yedekteki haliyle değiştirilecek (en fazla 4 karakter).`, 'Yükle', () => {
        const m = migrateDB(d); const gb = DB.shared.gbMarket;
        CUR.acc.chars = m.accounts.flatMap(a => a.chars).slice(0, MAX_CHARS); DB.shared = m.shared; DB.shared.gbMarket = gb;
        CUR.ch = null; bindView(); save(); showAuth('chars'); toast('Yedek yüklendi', 'ok');
      });
      else confirmBox('Yedekten yükle', `“${esc(f.name)}” eski sürüm yedeği; kayıtları <b>${esc(CUR.ch.name)}</b> karakterine aktarılacak (mevcut kayıtlarının yerini alır).`, 'Yükle', () => { CUR.ch.data = charDataFrom(migrate(d)); bindView(); save(); render(); toast('Yedek yüklendi', 'ok'); });
    } catch (e) { toast('Dosya okunamadı: ' + e.message, 'err'); }
    inp.value = '';
  };
  r.readAsText(f);
}

/* ---------- örnek veri ---------- */
function demoState() {
  const s = defaultState();
  const d = (m, day) => addMonth(localDate().slice(0, 7), m) + '-' + pad(day);
  Object.assign(s.settings, { charName: 'KaraŞövalye', server: 'Zero', gbTL: 335, kcPackTL: 227.5, kcPackKC: 400, usdTL: 0 });
  const tx = [[0, 3, 'gelir', 'Farm / Drop', 'Bifrost farm', 420e6], [0, 5, 'gider', 'Upgrade / Scroll', 'Blessed scroll x20', 180e6], [0, 9, 'gelir', 'GB satışı', '', 250e6], [0, 12, 'gider', 'Pot / Malzeme', 'MP pot', 35e6],
  [-1, 4, 'gelir', 'Farm / Drop', '', 380e6], [-1, 10, 'gider', 'Upgrade / Scroll', '', 220e6], [-1, 20, 'gelir', 'Görev / Event', 'Event ödülü', 150e6], [-2, 6, 'gelir', 'Farm / Drop', '', 300e6], [-2, 14, 'gider', 'Item alımı', '', 260e6], [-3, 8, 'gelir', 'Farm / Drop', '', 260e6], [-3, 18, 'gider', 'Pot / Malzeme', '', 60e6]];
  s.tx = tx.map(([m, day, type, cat, desc, amount]) => ({ id: uid(), date: d(m, day), type, cat, desc, amount, unit: 'noah' }));
  s.tx.push({ id: uid(), date: d(0, 7), type: 'gider', cat: 'GB alımı', desc: '1 GB', amount: 335, unit: 'tl' });
  s.prices = [['Krowaz Ring', 'Takı', 95e6], ['Iron Bar', 'Malzeme', 4.5e6], ['Blessed Upgrade Scroll', 'Scroll', 9e6], ['Chitin Shield +7', 'Zırh', 60e6]].map(([name, cat, price]) => ({ id: uid(), name, cat, price, updated: localDate(), hist: [{ d: localDate(), v: price }] }));
  s.trades = [
    { id: uid(), item: 'Chitin Shield +7', qty: 1, buyPrice: 48e6, buyDate: d(0, 2), sellPrice: 62e6, sellDate: d(0, 8), feePct: 3, status: 'satildi', note: '' },
    { id: uid(), item: 'Iron Bar', qty: 20, buyPrice: 3.8e6, buyDate: d(0, 6), sellPrice: 0, sellDate: '', feePct: 0, status: 'stok', note: 'fiyat yükselince sat' },
    { id: uid(), item: 'Krowaz Ring', qty: 1, buyPrice: 80e6, buyDate: d(-1, 3), sellPrice: 92e6, sellDate: d(-1, 15), feePct: 3, status: 'satildi', note: '' },
  ];
  const names = ['KaraŞövalye', 'Ejder', 'Gölge', 'Yıldız', 'Kartal', 'Fırtına', 'Bozkurt', 'Ay'];
  const members = names.map((n, i) => ({ id: uid(), name: n, weight: i === 7 ? 0.5 : 1, me: i === 0 }));
  s.parties = [{ id: uid(), name: 'Krowaz partisi', date: d(0, 10), place: 'Krowaz', members, leaderId: members[1].id, leaderPct: 5, feePct: 3, costs: 40e6, costPayer: members[1].id, status: 'acik', note: '',
    drops: [{ id: uid(), item: 'Krowaz Ring', qty: 1, value: 95e6, looter: members[1].id, sold: false, soldPrice: 0 }, { id: uid(), item: 'Iron Bar', qty: 12, value: 4.5e6, looter: members[2].id, sold: false, soldPrice: 0 }, { id: uid(), item: 'Blessed Upgrade Scroll', qty: 6, value: 9e6, looter: members[0].id, sold: true, soldPrice: 9.5e6 }] }];
  s.pus.buys = [{ id: uid(), date: d(0, 1), item: 'Premium (30 gün)', kc: 1500, qty: 1 }, { id: uid(), date: d(-1, 1), item: 'Premium (30 gün)', kc: 1500, qty: 1 }];
  s.exp = { calc: { level: 70, need: '', cur: 42, target: 100, perMob: '95k', mobHour: '320', bonus: 50, expHour: '' }, table: defaultExpTable(), sessions: [{ id: uid(), date: d(0, 11), level: 70, startPct: 30, endPct: 36.5, minutes: 120 }, { id: uid(), date: d(0, 12), level: 70, startPct: 36.5, endPct: 42, minutes: 95 }] };
  return s;
}

/* ---------- başlat ---------- */
(async function init() {
  await load();
  bindView();
  startAuth();
  if (serverMode) {
    const ping = () => fetch('/api/ping').catch(() => { });
    ping(); setInterval(ping, 15000);
    if (S.settings.autoRates) updateRates(true);
    if (S.settings.gbAuto) refreshGB(true);
    startLiveTimers();
    if (S.settings.autoSources && S.sources.length) for (const s of S.sources) runSource(s, true);
  }
})();
