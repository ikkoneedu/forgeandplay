'use strict';
/* ==========================================================================
   KO Ekip — Item Basma (örs) atölyesi
   • Örs: simülasyon (oyundaki gibi her deneme bağımsız rastgele)
   • Hesap: hedef +'ya ulaşmanın beklenen maliyeti, risk aralığı, "bas mı al mı"
   • Günlük: gerçek basmaları kaydet → gerçekleşen oran ve güven aralığı
   • Şans falı: eğlence; oranları değiştirmez
   Oranlar resmî değildir (yayıncı açıklamıyor). Varsayılanlar Knightpin'in
   Ağustos 2026 tablosundan; Ayarlar'dan / tablodan düzenlenebilir.
   ========================================================================== */
const ANV_SCROLLS = {
  bus: { t: 'BUS', d: 'Blessed Upgrade Scroll', grade: 'n' },
  bust: { t: 'BUS + Trina', d: "BUS + Trina's Piece", grade: 'n', extra: 'trina' },
  rev: { t: 'Reverse', d: 'Reverse Item Strengthen Scroll', grade: 'r' },
  revk: { t: 'Reverse + Karivdis', d: 'Reverse scroll + Tears of Karivdis', grade: 'r', extra: 'kariv' },
};
// anahtar = şu anki + (o seviyeden bir üste çıkma şansı, %)
const ANV_RATES_DEF = {
  bus: { 1: 100, 2: 100, 3: 100, 4: 75, 5: 55, 6: 30, 7: 10, 8: 1 },
  bust: { 1: 100, 2: 100, 3: 100, 4: 100, 5: 70, 6: 50, 7: 30, 8: 2 },
  rev: { 1: 100, 2: 30, 3: 30, 4: 30, 5: 30, 6: 10, 7: 10, 8: 10, 9: 10, 10: 5 },
  revk: { 1: 100, 2: 30, 3: 30, 4: 30, 5: 35, 6: 15, 7: 15, 8: 15, 9: 15, 10: 10 },
};
const ANV_MAX = { n: 9, r: 11 };
ICON.basma = I('<path d="M4 15h11l3-3H8"/><path d="M6 15v3h9v-3"/><path d="M9 18v3h3v-3"/><path d="m14 4 4 4"/><path d="m13 9 5-5"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'exp') + 1, 0, { id: 'basma', t: 'Item Basma', d: 'Örs simülasyonu, basma maliyeti, gerçek basma günlüğü ve şans falı' });

function anv() {
  const sh = DB.shared;
  if (!sh.anvil) sh.anvil = {};
  const a = sh.anvil;
  a.rates = a.rates || JSON.parse(JSON.stringify(ANV_RATES_DEF));
  for (const k of Object.keys(ANV_RATES_DEF)) a.rates[k] = Object.assign({}, ANV_RATES_DEF[k], a.rates[k] || {});
  a.log = a.log || [];
  a.cfg = Object.assign({ item: '', grade: 'n', scroll: 'bus', from: 1, to: 8, base: '', target: '', scrollNoah: '', feeNoah: '10k', tab: 'ors' }, a.cfg || {});
  return a;
}
const anvRate = (scroll, lv) => { const r = anv().rates[scroll] || {}; const v = r[lv]; return v == null ? null : Math.max(0, Math.min(100, +v)) / 100; };
const anvScrollsFor = g => Object.entries(ANV_SCROLLS).filter(([, s]) => s.grade === g);
const anvRand = () => { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; };
const anvCanon = n => { const k = acKey(n); const x = k && acIndex().find(y => y.k === k); return x ? x.n : n; };
const anvName = (item, g, lv) => `${g === 'r' ? 'Rev. ' : ''}${item ? anvCanon(item.trim()) : 'Item'} (+${lv})`;
/** bir denemenin maliyeti (TL): scroll + örs ücreti + varsa Trina / Karivdis */
function anvAttemptTL(scroll) {
  const c = anv().cfg, k = kcTL();
  const noah = parseAmt(c.scrollNoah) + parseAmt(c.feeNoah);
  const noahTL = noah ? (tlOf(noah) ?? 0) : 0;
  const ex = ANV_SCROLLS[scroll].extra;
  const exKC = ex === 'trina' ? pusUnitKC(/trina/i, 800) : ex === 'kariv' ? pusUnitKC(/karivdis/i, 400) : 0;
  return { tl: noahTL + exKC * k, noahTL, exKC, exTL: exKC * k };
}

/* ---------- beklenen maliyet (kesin hesap) + risk (Monte Carlo) ---------- */
function anvPlan(c) {
  const from = Math.round(parseNum(c.from)) || 1, to = Math.round(parseNum(c.to)) || from + 1;
  const base = parseNum(c.base);
  const att = anvAttemptTL(c.scroll).tl;
  const steps = []; let C = base, items = 1, pAll = 1, missing = false;
  for (let lv = from; lv < to; lv++) {
    const p = anvRate(c.scroll, lv);
    if (!p) { missing = true; steps.push({ lv, p: p || 0 }); break; }
    const tries = 1 / p;
    C = (C + att) / p; items = items / p; pAll *= p;
    steps.push({ lv, p, tries, cost: C, items });
  }
  return { from, to, base, att, steps, cost: missing ? null : C, items: missing ? null : items, pAll: missing ? 0 : pAll, missing };
}
let _mcKey = '', _mcVal = null;
function anvMonteCarlo(c) {
  const P = anvPlan(c); if (P.missing || !P.steps.length) return null;
  const ps = P.steps.map(s => s.p), costs = [], itemsArr = [];
  const key = JSON.stringify([ps, P.base, P.att]);
  if (key === _mcKey) return _mcVal;
  // beklenen toplam deneme: A(n+1) = (A(n) + 1) / p
  let A = 0; for (const p of ps) A = (A + 1) / p;
  const runs = Math.min(4000, Math.floor(4e5 / Math.max(1, A)));
  if (runs < 250) { _mcKey = key; _mcVal = null; return null; } // çok düşük ihtimal: yalnız kesin ortalama gösterilir
  let x = (Date.now() ^ 0x9e3779b9) >>> 0 || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let r = 0; r < runs; r++) {
    let cost = P.base, items = 1, lv = 0, guard = 0;
    while (lv < ps.length && guard++ < 200000) {
      cost += P.att;
      if (rnd() < ps[lv]) lv++;
      else { lv = 0; items++; cost += P.base; }
    }
    costs.push(cost); itemsArr.push(items);
  }
  costs.sort((a, b) => a - b); itemsArr.sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  _mcKey = key; _mcVal = { p50: q(costs, .5), p90: q(costs, .9), p99: q(costs, .99), i50: q(itemsArr, .5), i90: q(itemsArr, .9), best: costs[0], runs };
  return _mcVal;
}

/* ---------- gerçek basma günlüğü istatistiği (Wilson %95) ---------- */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n, m = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (m - s) / d), Math.min(1, (m + s) / d)];
}
function anvStats() {
  const g = {};
  for (const e of anv().log) { const k = e.scroll + '|' + e.lv; (g[k] = g[k] || { scroll: e.scroll, lv: e.lv, n: 0, ok: 0 }); g[k].n++; if (e.ok) g[k].ok++; }
  return Object.values(g).sort((a, b) => a.scroll.localeCompare(b.scroll) || a.lv - b.lv);
}

/* ---------- örs simülasyonu ---------- */
const ORS = { lv: null, busy: false, last: null, tries: 0, ok: 0, burned: 0, spent: 0, best: 0, hist: [], auto: false };
function orsReset() { const c = anv().cfg; Object.assign(ORS, { lv: Math.round(parseNum(c.from)) || 1, last: null, tries: 0, ok: 0, burned: 0, spent: 0, best: Math.round(parseNum(c.from)) || 1, hist: [], auto: false }); }
function orsHit() {
  const c = anv().cfg; if (ORS.lv == null) orsReset();
  const p = anvRate(c.scroll, ORS.lv);
  if (!p) { toast(`+${ORS.lv} için ${ANV_SCROLLS[c.scroll].t} oranı tanımlı değil.`, 'err'); ORS.auto = false; return false; }
  ORS.tries++; ORS.spent += anvAttemptTL(c.scroll).tl;
  const ok = anvRand() < p, from = ORS.lv;
  if (ok) { ORS.ok++; ORS.lv++; ORS.best = Math.max(ORS.best, ORS.lv); }
  else { ORS.burned++; ORS.spent += parseNum(c.base); ORS.lv = Math.round(parseNum(c.from)) || 1; }
  ORS.last = { ok, from, p };
  ORS.hist.unshift({ ok, from, p }); if (ORS.hist.length > 40) ORS.hist.pop();
  return true;
}
function orsAnimate() {
  if (ORS.busy) return;
  ORS.busy = true; render();
  setTimeout(() => { orsHit(); ORS.busy = false; render(); }, 650);
}
function orsAuto() {
  const c = anv().cfg, to = Math.round(parseNum(c.to)) || 9;
  ORS.auto = true; let n = 0;
  const step = () => {
    if (!ORS.auto || ui.page !== 'basma') { ORS.auto = false; render(); return; }
    for (let i = 0; i < 25 && ORS.lv < to; i++) { if (!orsHit()) return; n++; }
    render();
    if (ORS.lv >= to || n > 20000) { ORS.auto = false; render(); toast(ORS.lv >= to ? `Hedefe ${fmtN(ORS.tries)} denemede, ${fmtN(ORS.burned)} yanan itemle ulaşıldı (simülasyon).` : 'Çok uzun sürdü, durduruldu.', 'ok'); return; }
    setTimeout(step, 30);
  };
  step();
}


/* ---------- canlı pazardan item kimliği + oyun içi özellikler (+N → +N+1) ---------- */
const SPEC = { key: '', busy: false, err: '', rows: null, pick: null, cur: null, next: null, timer: null };
const isRevType = t => +t === 11 || +t === 12;
const plusOfName = n => { const m = String(n).match(/\(\+\s?(\d{1,2})\)|\+\s?(\d{1,2})\b/); return m ? +(m[1] || m[2]) : 0; };
const tipCache = new Map();
async function tipOf(id) {
  if (tipCache.has(id)) return tipCache.get(id);
  const p = itemApi({ action: 'tooltip', itemId: id }).then(j => (j && j.html ? j : null)).catch(() => null);
  tipCache.set(id, p); return p;
}
/** tooltip metninden "Etiket : sayı" satırları */
function tipStats(html) {
  const out = {}, doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('li').forEach(li => {
    const m = li.textContent.replace(/\s+/g, ' ').match(/^\s*([^:]{2,40}?)\s*:\s*([\d.,]+)(?:\s*\/\s*([\d.,]+))?/);
    if (m) out[m[1].trim()] = parseFloat(m[2].replace(/,/g, ''));
  });
  return out;
}
function specKey() {
  const c0 = anv().cfg, bk = c0.item.trim().toLowerCase() + '|' + c0.grade;
  if (SPEC.baseKey !== bk) { SPEC.baseKey = bk; SPEC.pickVb = null; SPEC.pazarTried = ''; } const c = anv().cfg; return [c.item.trim().toLowerCase(), c.grade, ORS.lv].join('|'); }
function specSchedule() {
  const k = specKey(); if (k === SPEC.key) return;
  SPEC.key = k; SPEC.cur = SPEC.next = null; SPEC.err = ''; clearTimeout(SPEC.timer);
  if (!anv().cfg.item.trim()) { SPEC.rows = null; return; }
  SPEC.timer = setTimeout(specLoad, 400);
}
// Item numarası düzeni (oyunun item tablosu): her varyant ardışık numaralı; Reverse'te 30, normalde 10 seviyelik bloklar.
// Örn. Rev. Raptor zehirli: 156212031 = +1 … 156212037 = +7 (oyundaki tooltip ile birebir doğrulandı).
const varSize = rev => rev ? 30 : 10;
const idxOf = (id, rev) => ((id % 100) - 1 + varSize(rev)) % varSize(rev) + 1;
const EL_TR = { 'Flame Damage': 'Ateş', 'Glacier Damage': 'Buz', 'Lightning Damage': 'Elektrik', 'Poison Damage': 'Zehir', 'HP Drain': 'HP emme', 'MP Drain': 'MP emme', 'MP Damage': 'MP hasarı' };
function varLabel(html) {
  const st = tipStats(html), parts = Object.keys(EL_TR).filter(k => st[k]).map(k => `${EL_TR[k]} ${st[k]}`);
  return parts.length ? parts.join(' · ') : 'Düz';
}
async function specLoad() {
  const c = anv().cfg, key = SPEC.key, base = acBase(anvCanon(c.item.trim())), lv = ORS.lv, rev = c.grade === 'r';
  SPEC.busy = true; specPaint();
  try {
    // 1) kendi veritabanımız: bu itemin varyantları
    const all = await idVariantsFor(base, rev);
    if (key !== SPEC.key) return;
    if (!all.length) { SPEC.vars = []; SPEC.err = `Veritabanında ${rev ? 'Reverse ' : ''}${base} bulunamadı.`; return; }
    const vars = await idVariantOptions(all, lv);
    if (key !== SPEC.key) return;
    if (!vars.length) { SPEC.vars = []; SPEC.err = `+${lv} için bilgi yok.`; return; }
    SPEC.vars = vars;
    // 2) seçili varyant: kullanıcı seçimi > canlı pazardaki ilan (varsa) > en sade olan
    let pick = vars.find(v => v.alt.includes(SPEC.pickVb));
    if (!pick && !SPEC.pazarTried) {
      SPEC.pazarTried = base + rev;
      try {
        const rows = await listApi({ query: base });
        const ids = rows.filter(r => r.id && trLow(acBase(r.name)) === trLow(base)).map(r => +r.id);
        for (const id of ids) { const v = vars.find(v => v.alt.some(vb => id > vb && id <= vb + v.size)); if (v) { pick = v; break; } }
      } catch { /* pazar yoksa sorun değil */ }
      if (key !== SPEC.key) return;
    }
    pick = pick || vars[0];
    SPEC.pickVb = pick.vb;
    if (lv > pick.maxLv) { SPEC.err = `Bu varyant en fazla +${pick.maxLv}.`; SPEC.cur = null; return; }
    const [a, b] = await Promise.all([idRow(pick.vb + lv), lv < pick.maxLv ? idRow(pick.vb + lv + 1) : null]);
    if (key !== SPEC.key) return;
    if (!a) { SPEC.err = 'Bu seviyenin bilgisi veritabanında yok.'; return; }
    SPEC.cur = { o: a, lv, name: pick.name };
    SPEC.next = b ? { o: b, lv: lv + 1, name: pick.name } : null;
  } catch (e) { SPEC.err = 'Item verisi okunamadı: ' + e.message; }
  finally { SPEC.busy = false; specPaint(); }
}
function specPaint() { if (ui.page === 'basma' && (anv().cfg.tab || 'ors') === 'ors') render(); }
function specView() {
  const c = anv().cfg;
  if (!c.item.trim()) return '';
  specSchedule();
  const head = `<div class="card-h"><h3>Basınca ne değişir?</h3><span class="sub">oyunun item tablosundan</span></div>`;
  const vsel = (SPEC.vars || []).length > 1 ? `<div class="spec-vars"><span class="mut">Senin itemin hangisi?</span><select class="inp" data-specvar="1">${SPEC.vars.map(v => `<option value="${v.vb}" ${v.alt.includes(SPEC.pickVb) ? 'selected' : ''}>${esc(v.text)}</option>`).join('')}</select></div>` : '';
  if (SPEC.busy && !SPEC.cur) return `<div class="card">${head}<div class="skeleton" style="height:160px"></div></div>`;
  if (!SPEC.cur) return `<div class="card">${head}${vsel}<div class="mut">${esc(SPEC.err || 'Yükleniyor…')}</div></div>`;
  const icon = itemIconPath(c.item);
  const diffs = SPEC.next ? idDiff(SPEC.cur.o, SPEC.next.o) : [];
  const fmtv = v => Number.isInteger(v) ? fmtN(v) : nf2.format(v);
  return `<div class="card">${head}${vsel}
    ${diffs.length ? `<div class="spec-diff">${diffs.map(x => `<div><span>${esc(x.k)}</span><b>${fmtv(x.a)} → ${fmtv(x.b)}</b><i class="${(x.d > 0) !== /^Required/.test(x.k) ? 'pos' : 'neg'}">${x.d > 0 ? '+' : ''}${fmtv(x.d)}</i></div>`).join('')}</div>` : SPEC.next ? '<div class="mut" style="margin-bottom:10px">Bu adımda özellik değişmiyor.</div>' : '<div class="mut" style="margin-bottom:10px">Bu, itemin en yüksek seviyesi.</div>'}
    <div class="spec-tips">
      <div class="ko-tip">${idTipHtml(SPEC.cur.o, SPEC.cur.name, SPEC.cur.lv, icon)}</div>
      ${SPEC.next ? `<div class="ko-tip">${idTipHtml(SPEC.next.o, SPEC.next.name, SPEC.next.lv, icon)}</div>` : ''}
    </div>
  </div>`;
}

/* ---------- şans falı (eğlence) ---------- */
const FAL_Q = [
  ['Bugün örse kaç kere "son bir tane" dedin?', ['Hiç', 'Bir iki', 'Saymayı bıraktım']],
  ['Envanterinde kaç tane yanmış item hatırası var?', ['Yok', 'Biraz', 'Mezarlık gibi']],
  ['Moradon\'da örsün başında kaç kişi bekliyor?', ['Kimse', 'Birkaç kişi', 'Kuyruk var']],
  ['Bugün PK\'da ölünce ne dedin?', ['Olur böyle', 'Lag vardı', 'Sorma']],
  ['Klan arkadaşın az önce +8 bastı mı?', ['Hayır', 'Evet', 'Üstüne +9 bastı']],
  ['Bugün mob kestiğinde düşen ilk şey neydi?', ['Noah', 'Çöp item', 'Hatırlamıyorum']],
  ['Şu an kaç saattir oyundasın?', ['1 saatten az', '2–5 saat', 'Güneş doğdu']],
  ['En son ne zaman "bu sefer kesin" dedin?', ['Hiç demedim', 'Dün', '5 dakika önce']],
  ['Kahve / çay durumu?', ['Taze', 'Soğudu', 'Bitti']],
  ['Karakterinin adı kaç harf?', ['Kısa', 'Orta', 'Uzun']],
];
const FAL = { qs: null, ans: [], res: null };
function falNew() { const pool = [...FAL_Q]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(anvRand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } FAL.qs = pool.slice(0, 5); FAL.ans = []; FAL.res = null; }
function falResult() {
  // cevaplar + günün tarihi → sabit, eğlenceli bir "ruh hali" puanı (oyundaki şansla ilgisi yok)
  let h = 7; const s = localDate() + '|' + FAL.ans.join(',') + '|' + (CUR.ch ? CUR.ch.name : '');
  for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const score = 35 + (h % 61);
  const msg = score >= 85 ? 'Yıldızlar parlıyor, örs bugün sana gülümsüyor gibi… ama o gülümseme her basışta aynı.'
    : score >= 65 ? 'Keyfin yerinde. Yine de bütçeni belirleyip ona sadık kal.'
    : score >= 50 ? 'Orta karar bir gün. Bir kahve molası iyi gelebilir.'
    : 'Bugün "son bir tane" günü gibi görünüyor. Bir mola ver, örs kaçmıyor.';
  FAL.res = { score, msg };
}

/* ---------- görünüm ---------- */
VIEWS.basma = () => {
  const A = anv(), c = A.cfg, tab = c.tab || 'ors';
  if (!anvScrollsFor(c.grade).some(([k]) => k === c.scroll)) c.scroll = anvScrollsFor(c.grade)[0][0];
  if (ORS.lv == null) orsReset();
  const tabs = [['ors', 'Örs'], ['hesap', 'Bas mı, al mı?'], ['gunluk', 'Gerçek günlük'], ['fal', 'Şans falı'], ['bilgi', 'Nasıl çalışır']];
  const head = `<div class="card anv-bar">
    <div class="anv-row">
      <label class="f anv-item">Item<input class="inp" data-ac="item" autocomplete="off" data-fk="anv-item" data-anv="item" value="${esc(c.item)}" placeholder="örn. Raptor, Iron Bow"></label>
      <label class="f">Tür<div class="seg">${[['n', 'Normal'], ['r', 'Reverse']].map(([k, l]) => `<button class="${c.grade === k ? 'on' : ''}" data-act="anv-grade" data-v="${k}">${l}</button>`).join('')}</div></label>
      <label class="f">Scroll<select class="inp" data-anv="scroll">${anvScrollsFor(c.grade).map(([k, s]) => `<option value="${k}" ${c.scroll === k ? 'selected' : ''}>${s.t}</option>`).join('')}</select></label>
      <label class="f anv-n">Başlangıç +<input class="inp num" data-fk="anv-from" data-anv="from" value="${esc(c.from)}"></label>
      <label class="f anv-n">Hedef +<input class="inp num" data-fk="anv-to" data-anv="to" value="${esc(c.to)}"></label>
    </div>
  </div>
  <div class="seg anv-tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="anv-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return head + (tab === 'ors' ? anvOrsView() : tab === 'hesap' ? anvCalcView() : tab === 'gunluk' ? anvLogView() : tab === 'fal' ? anvFalView() : anvInfoView());
};

function anvOrsView() {
  const c = anv().cfg, p = anvRate(c.scroll, ORS.lv), to = Math.round(parseNum(c.to)) || 9;
  const last = ORS.last;
  const state = ORS.busy ? 'busy' : last ? (last.ok ? 'ok' : 'burn') : '';
  return `<div class="grid g-wide" style="margin-top:14px">
    <div class="card anv-anvil ${state}">
      <div class="anv-sim">Simülasyon · oyundaki sonucu etkilemez</div>
      <div class="anv-stage">
        <div class="anv-glow"></div>
        <div class="anv-item-card">
          ${typeof itemIcon === 'function' ? itemIcon((SPEC.icon && SPEC.rows && trLow(SPEC.rows.base) === trLow(acBase(c.item))) ? SPEC.icon : itemIconPath(c.item), c.item || 'Item', 72, 'anv-ic' + (c.grade === 'r' ? ' rev' : '')) : ''}
          <b>${esc(anvName(c.item, c.grade, ORS.lv))}</b>
          <span>${p != null ? `Bir üste çıkma şansı <b class="gold">%${fmtX(p * 100)}</b>` : 'Bu seviye için oran yok'}</span>
        </div>
        <div class="anv-result">${ORS.busy ? 'Örs çalışıyor…' : last ? (last.ok ? `✨ Geçti! +${last.from} → +${last.from + 1}` : `🔥 Yandı (+${last.from}, şans %${fmtX(last.p * 100)} idi)`) : 'Hazır'}</div>
      </div>
      <div class="anv-acts">
        <button class="btn pri anv-hit" data-act="anv-hit" ${ORS.busy || ORS.auto || p == null ? 'disabled' : ''}>Bas</button>
        <button class="btn" data-act="${ORS.auto ? 'anv-stop' : 'anv-auto'}" ${p == null && !ORS.auto ? 'disabled' : ''}>${ORS.auto ? 'Durdur' : `+${to}'e kadar otomatik bas`}</button>
        <button class="btn ghost" data-act="anv-reset">Sıfırla</button>
      </div>
      <div class="hint" style="text-align:center">Yanınca item gider; simülasyon başlangıç seviyesinde yeni bir itemle devam eder (değeri harcamaya eklenir).</div>
    </div>
    <div class="stack">
      <div class="grid anv-stats">
        ${stat('Deneme', fmtN(ORS.tries), `${fmtN(ORS.ok)} geçti`, 'var(--blue)')}
        ${stat('Yanan item', fmtN(ORS.burned), ORS.tries ? `%${fmtX(ORS.burned / ORS.tries * 100)} yanma` : '', 'var(--red)')}
        ${stat('Harcanan', fmtTL(ORS.spent), S.settings.gbTL ? nf2.format(ORS.spent / S.settings.gbTL) + ' GB' : 'scroll + ücret + yanan item', 'var(--gold)')}
        ${stat('En yüksek', '+' + ORS.best, `hedef +${to}`, 'var(--green)')}
      </div>
      <div class="card">
        <div class="card-h"><h3>Son basışlar</h3><span class="sub">her biri bağımsız</span></div>
        ${ORS.hist.length ? `<div class="anv-hist">${ORS.hist.map(h => `<span class="${h.ok ? 'ok' : 'burn'}" title="+${h.from} · %${fmtX(h.p * 100)}">+${h.from}</span>`).join('')}</div>` : '<div class="mut">Henüz basılmadı.</div>'}
      </div>
      <div class="card">
        <div class="card-h"><h3>Oyunda bastın mı? Kaydet</h3></div>
        <div class="hint" style="margin-bottom:10px">Yukarıdaki item / scroll / başlangıç + ile gerçek denemeni tek dokunuşla günlüğe yaz; zamanla gerçek oranı görürsün.</div>
        <div class="row"><button class="btn" data-act="anv-log" data-ok="1">✅ +${esc(c.from)} geçti</button><button class="btn" data-act="anv-log" data-ok="0">🔥 +${esc(c.from)} yandı</button></div>
      </div>
    </div>
  </div>
  <div style="margin-top:14px">${specView()}</div>`;
}

function anvCalcView() {
  const c = anv().cfg, P = anvPlan(c), mc = anvMonteCarlo(c), at = anvAttemptTL(c.scroll);
  const tgt = parseNum(c.target);
  const gb = v => S.settings.gbTL ? `<div class="hint">${nf2.format(v / S.settings.gbTL)} GB</div>` : '';
  let verdict = '';
  if (P.cost != null && tgt) {
    const d = P.cost - tgt;
    verdict = d > 0 ? `<div class="callout y">Ortalamada <b>hazır almak ${fmtTL(d)} daha ucuz</b>. Basarak ulaşmanın beklenen maliyeti ${fmtTL(P.cost)}, hazır fiyat ${fmtTL(tgt)}.</div>`
      : `<div class="callout">Ortalamada <b>basmak ${fmtTL(-d)} daha ucuz</b> görünüyor. Ama şans yüzünden %10 ihtimalle ${mc ? fmtTL(mc.p90) : '—'} veya daha fazlası gidebilir.</div>`;
  }
  return `<div class="grid g-wide" style="margin-top:14px">
    <div class="stack">
      <div class="card">
        <div class="card-h"><h3>Maliyetler</h3><span class="sub">TL; noah GB fiyatından çevrilir</span></div>
        <div class="form anv-cost">
          <label class="f">+${esc(P.from)} itemin fiyatı (TL)<input class="inp num" data-fk="anv-base" data-anv="base" value="${esc(c.base)}" placeholder="örn. 650"><span class="hint">başlangıç itemi; her yanışta bir tane daha gerekir</span></label>
          <label class="f">Hazır +${esc(P.to)} fiyatı (TL)<input class="inp num" data-fk="anv-target" data-anv="target" value="${esc(c.target)}" placeholder="örn. 15000"><span class="hint"><a href="#" data-act="anv-find">Site İlanlarında ara →</a></span></label>
          <label class="f">Scroll fiyatı (noah)<input class="inp num" data-fk="anv-sn" data-anv="scrollNoah" value="${esc(c.scrollNoah)}" placeholder="örn. 3m"></label>
          <label class="f">Örs ücreti (noah)<input class="inp num" data-fk="anv-fee" data-anv="feeNoah" value="${esc(c.feeNoah)}" placeholder="10k"></label>
        </div>
        <div class="hint" style="margin-top:8px">Deneme başı: ${fmtTL(at.tl)}${at.exKC ? ` (içinde ${fmtX(at.exKC)} KC ${ANV_SCROLLS[c.scroll].extra === 'trina' ? 'Trina' : 'Karivdis'} = ${fmtTL(at.exTL)})` : ''}${!S.settings.gbTL && (parseAmt(c.scrollNoah) || parseAmt(c.feeNoah)) ? ' · <span class="neg">GB fiyatı girilmemiş, noah TL\'ye çevrilemiyor</span>' : ''}</div>
      </div>
      <div class="grid g4">
        ${stat('Beklenen maliyet', P.cost != null ? fmtTL(P.cost) : '—', P.cost != null && S.settings.gbTL ? nf2.format(P.cost / S.settings.gbTL) + ' GB' : 'ortalama', 'var(--gold)')}
        ${stat('Beklenen yanan item', P.items != null ? fmtX(Math.max(0, P.items - 1)) : '—', `+${P.from} item`, 'var(--red)')}
        ${stat('Tek itemle ulaşma', P.missing ? '—' : '%' + fmtX(P.pAll * 100), 'hiç yanmadan', 'var(--green)')}
        ${stat('%90 ihtimalle en fazla', mc ? fmtTL(mc.p90) : '—', mc ? `${fmtN(mc.i90)} item · 4.000 simülasyon` : '', 'var(--violet)')}
      </div>
      ${verdict}
      ${P.missing ? `<div class="callout">+${P.steps[P.steps.length - 1].lv} için ${ANV_SCROLLS[c.scroll].t} oranı tanımlı değil; "Nasıl çalışır" sekmesindeki tablodan ekleyebilirsin.</div>` : ''}
    </div>
    <div class="card">
      <div class="card-h"><h3>Adım adım</h3><span class="sub">${esc(ANV_SCROLLS[c.scroll].t)}</span></div>
      ${P.steps.length ? `<div class="tbl-wrap"><table class="no-card anv-tbl"><thead><tr><th>Adım</th><th class="num">Şans</th><th class="num">Ort. deneme</th><th class="num">Bu seviyeye maliyet</th></tr></thead><tbody>
        ${P.steps.map(s => `<tr><td>+${s.lv} → +${s.lv + 1}</td><td class="num">${s.p ? '%' + fmtX(s.p * 100) : '—'}</td><td class="num">${s.tries ? fmtX(Math.round(s.tries * 10) / 10) : '—'}</td><td class="num">${s.cost != null ? fmtTL(s.cost) + gb(s.cost) : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="hint" style="margin-top:8px">Yanan item bir alt seviyeden yeniden basılmak zorunda kaldığı için maliyet her adımda katlanır. Medyan ${mc ? fmtTL(mc.p50) : '—'}, şanslı en iyi ${mc ? fmtTL(mc.best) : '—'}, %1 kötü senaryo ${mc ? fmtTL(mc.p99) : '—'}.</div>` : empty('Başlangıç ve hedefi seç')}
    </div>
  </div>`;
}

function anvLogView() {
  const A = anv(), st = anvStats(), log = [...A.log].reverse().slice(0, 60);
  return `<div class="grid g-wide" style="margin-top:14px">
    <div class="card">
      <div class="card-h"><h3>Gerçekleşen oranlar</h3><span class="sub">${fmtN(A.log.length)} gerçek deneme</span></div>
      ${st.length ? `<div class="tbl-wrap"><table class="no-card"><thead><tr><th>Scroll</th><th>Adım</th><th class="num">Deneme</th><th class="num">Geçti</th><th class="num">Senin oranın</th><th class="num">Tablo</th></tr></thead><tbody>
        ${st.map(s => { const [lo, hi] = wilson(s.ok, s.n), t = anvRate(s.scroll, s.lv); return `<tr><td>${esc((ANV_SCROLLS[s.scroll] || {}).t || s.scroll)}</td><td>+${s.lv} → +${s.lv + 1}</td><td class="num">${s.n}</td><td class="num">${s.ok}</td><td class="num"><b>%${fmtX(s.ok / s.n * 100)}</b><div class="hint">%95: ${fmtX(lo * 100)}–${fmtX(hi * 100)}</div></td><td class="num mut">${t != null ? '%' + fmtX(t * 100) : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="hint" style="margin-top:8px">Az denemede oran çok oynar; aralık daraldıkça gerçek orana yaklaşırsın. Ekipçe kaydedilirse aralık çok daha hızlı daralır.</div>` : empty('Henüz kayıt yok', 'Örs sekmesindeki ✅ / 🔥 düğmeleriyle oyundaki denemelerini kaydet.')}
    </div>
    <div class="card">
      <div class="card-h"><h3>Son kayıtlar</h3>${A.log.length ? '<button class="btn sm ghost" data-act="anv-log-clear">Temizle</button>' : ''}</div>
      ${log.length ? `<div class="tbl-wrap" style="max-height:480px"><table><thead><tr><th>Item</th><th>Scroll</th><th>Sonuç</th><th>Tarih</th><th></th></tr></thead><tbody>
        ${log.map(e => `<tr><td><span class="anv-li">${itemIcon(itemIconPath(e.item), e.item || 'Item', 26)}<b>${esc(anvName(e.item, (ANV_SCROLLS[e.scroll] || {}).grade, e.lv))}</b></span></td><td>${esc((ANV_SCROLLS[e.scroll] || {}).t || e.scroll)}</td><td>${e.ok ? '<span class="badge g">geçti</span>' : '<span class="badge r">yandı</span>'}</td><td class="mut">${fmtDate(e.date)}</td><td><button class="icon-btn" data-act="anv-log-del" data-id="${e.id}" title="Sil">${ICON.del}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="mut">—</div>'}
    </div>
  </div>`;
}

function anvFalView() {
  if (!FAL.qs) falNew();
  const done = FAL.ans.length >= FAL.qs.length;
  const c = anv().cfg, p = anvRate(c.scroll, Math.round(parseNum(c.from)) || 1);
  return `<div class="grid g-wide" style="margin-top:14px">
    <div class="card anv-fal">
      <div class="anv-sim">Eğlence amaçlı · oyundaki basma şansını değiştirmez</div>
      ${!done ? (() => { const i = FAL.ans.length, [q, opts] = FAL.qs[i]; return `<div class="fal-q"><span class="mut">Soru ${i + 1} / ${FAL.qs.length}</span><h3>${esc(q)}</h3><div class="fal-opts">${opts.map((o, j) => `<button class="btn" data-act="fal-ans" data-v="${j}">${esc(o)}</button>`).join('')}</div></div>`; })()
        : `<div class="fal-res"><div class="fal-score">%${FAL.res.score}</div><div class="mut">bugünkü ruh hali puanın</div><p>${esc(FAL.res.msg)}</p><button class="btn" data-act="fal-new">Yeniden sor</button></div>`}
    </div>
    <div class="card">
      <div class="card-h"><h3>Matematik ne diyor?</h3></div>
      <p style="margin:0 0 10px;color:var(--tx2);line-height:1.6">${esc(anvName(c.item, c.grade, Math.round(parseNum(c.from)) || 1))} için ${esc(ANV_SCROLLS[c.scroll].t)} ile bir üste çıkma şansı, falın ne derse desin, <b class="gold">${p != null ? '%' + fmtX(p * 100) : 'bilinmiyor'}</b>. Bu oran her basışta aynı; önceki yanmalar, saat ya da ruh hali onu değiştirmez.</p>
      <p style="margin:0;color:var(--tx3);font-size:13px;line-height:1.55">Kendine bir bütçe koy (ör. "en fazla 3 item yakarım") ve ona uy. "Bas mı, al mı?" sekmesi bütçenin neye yettiğini gösterir.</p>
    </div>
  </div>`;
}

function anvInfoView() {
  const A = anv();
  const levels = Array.from({ length: 11 }, (_, i) => i + 1);
  return `<div class="grid g-wide" style="margin-top:14px">
    <div class="card">
      <div class="card-h"><h3>Örs nasıl karar veriyor?</h3></div>
      <div class="anv-facts">
        <div><b>Her deneme bağımsız.</b> Açık kaynak KO sunucu kodunda örs her basışta 0–10.000 arası yeni bir rastgele sayı çeker; sayı o adımın oranının altındaysa item geçer, değilse yanar.</div>
        <div><b>Geçmiş sonucu etkilemez.</b> 5 kere üst üste yanması, 6.'nın geçme ihtimalini artırmaz (kumarbaz yanılgısı). Sunucu önceki denemeleri hatırlamaz.</div>
        <div><b>"Fake basma", ısındırma, saat, kutu yeri:</b> kodda bunların hiçbiri sayıya girmiyor. İtemi hangi kutuya koyduğun sunucuya aynı şekilde gider.</div>
        <div><b>Neden "örs sıcakken" geçmiş gibi gelir?</b> Geçenleri hatırlarız, yanan yüzlercesini unuturuz. Gerçek günlük tutunca bu yanılgı görünür olur.</div>
        <div><b>Trina's Piece / Tears of Karivdis</b> o adımın oranını yükseltir (ör. BUS +7→+8: %10 → %30); yanmayı tamamen engellemez.</div>
        <div><b>Oranlar resmî değil.</b> Yayıncı açıklamıyor; tablo oyuncu istatistiği / site tahminidir, etkinliklerde değişebilir. Aşağıdan düzenleyebilirsin.</div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Oran tablosu (%)</h3><button class="btn sm ghost" data-act="anv-rates-def">Varsayılana dön</button></div>
      <div class="tbl-wrap"><table class="no-card anv-rates"><thead><tr><th>+</th>${Object.values(ANV_SCROLLS).map(s => `<th class="num">${esc(s.t)}</th>`).join('')}</tr></thead><tbody>
        ${levels.map(lv => `<tr><td>+${lv}→+${lv + 1}</td>${Object.keys(ANV_SCROLLS).map(k => { const v = A.rates[k][lv]; return `<td class="num"><input class="inp cell num" data-fk="ar-${k}-${lv}" data-anr="${k}" data-lv="${lv}" value="${v == null ? '' : esc(v)}" placeholder="—"></td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="hint" style="margin-top:8px">Varsayılan: Knightpin "Knight Online Upgrade Oranları" (26.08.2026 tablosu). Boş = tanımlı değil.</div>
    </div>
  </div>`;
}

Object.assign(ACTIONS, {
  'anv-tab': el => { anv().cfg.tab = el.dataset.v; save(); render(); },
  'anv-grade': el => { const c = anv().cfg; c.grade = el.dataset.v; c.scroll = anvScrollsFor(c.grade)[0][0]; if (c.grade === 'n' && +c.to > ANV_MAX.n) c.to = ANV_MAX.n; orsReset(); save(); render(); },
  'anv-hit': () => orsAnimate(),
  'anv-auto': () => orsAuto(),
  'anv-stop': () => { ORS.auto = false; render(); },
  'anv-reset': () => { orsReset(); render(); },
  'anv-log': el => {
    const c = anv().cfg, lv = Math.round(parseNum(c.from)) || 1;
    anv().log.push({ id: uid(), date: localDate(), at: Date.now(), item: c.item.trim(), scroll: c.scroll, lv, ok: el.dataset.ok === '1' });
    if (anv().log.length > 3000) anv().log.splice(0, anv().log.length - 3000);
    save(); toast(el.dataset.ok === '1' ? 'Geçti olarak kaydedildi' : 'Yandı olarak kaydedildi', 'ok'); render();
  },
  'anv-log-del': el => { const a = anv(); a.log = a.log.filter(e => e.id !== el.dataset.id); save(); render(); },
  'anv-log-clear': () => confirmBox('Günlüğü temizle', 'Tüm gerçek basma kayıtların silinecek. Emin misin?', 'Sil', () => { anv().log = []; save(); render(); }),
  'anv-rates-def': () => { anv().rates = JSON.parse(JSON.stringify(ANV_RATES_DEF)); save(); render(); },
  'anv-find': () => {
    const c = anv().cfg; if (!c.item.trim()) { toast('Önce item adını yaz.', 'err'); return; }
    IL.kind = 'item'; IL.q = `${c.grade === 'r' ? 'rev ' : ''}${c.item.trim()} +${c.to}`; ui.page = 'ilan'; render(); ilSearch();
  },
  'fal-ans': el => { FAL.ans.push(+el.dataset.v); if (FAL.ans.length >= FAL.qs.length) falResult(); render(); },
  'fal-new': () => { falNew(); render(); },
});
document.addEventListener('input', e => {
  const d = e.target.dataset;
  if (d.anv && e.target.tagName !== 'SELECT') {
    const c = anv().cfg; c[d.anv] = e.target.value; if (d.anv === 'from') ORS.lv = null; save();
    // item kutusunda yazarken yeniden çizme (öneri listesi kapanmasın); seçince / kutudan çıkınca çizilir
    if (d.anv !== 'item') render();
  }
  else if (d.anr) { const r = anv().rates[d.anr]; const v = e.target.value.trim(); if (v === '') delete r[d.lv]; else r[d.lv] = Math.max(0, Math.min(100, parseNum(v))); save(); }
});
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.specvar) { SPEC.pickVb = +e.target.value; SPEC.key = ''; render(); return; }
  if (d.anv === 'item') { render(); return; }
  if (d.anv && e.target.tagName === 'SELECT') { anv().cfg[d.anv] = e.target.value; ORS.last = null; save(); render(); }
  else if (d.anr) render();
});
