/**
 * Arayüz duman testi: public/ statik sunulur, uygulama Chromium'da örnek veriyle açılır.
 *  - Tüm sayfalar masaüstü ve telefon genişliğinde: JS hatası, boş içerik, yatay taşma yok
 *  - Yeni özelliklerin ana akışları (günlük görevler, grind, yoklama/drop, ekip bul, GB alarmı, boss penceresi)
 * Çalıştır: npm run test:ui   (Chromium: CHROMIUM_PATH ya da `npx playwright-core install chromium`)
 * Firebase / ağ çağrıları sahte; yalnızca istemci mantığı ve görünüm sınanır.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = join(import.meta.dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
let server, base, browser;

before(async () => {
  server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); server?.close(); });

/** uygulamayı aç, Firebase'i sahtele, örnek karakter ve ekiple giriş yapılmış duruma getir */
async function openApp(width = 1280, height = 900) {
  const pg = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route(u => !u.href.startsWith(base), r => r.abort());
  await pg.goto(base + '/kohesap-app/index.html');
  await pg.waitForFunction(() => typeof VIEWS !== 'undefined' && typeof demoState === 'function');
  // açılış (oturum kontrolü → giriş ekranı) bitsin; yoksa sonradan gelen giriş ekranı uygulamayı örter
  await pg.waitForFunction(() => { const a = document.getElementById('auth'); return a && !a.hidden && a.textContent.trim().length > 0; }, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  await pg.evaluate(() => {
    const nop = () => ({}), snap = { exists: () => false, data: () => null, docs: [] };
    window.__writes = [];
    Object.assign(window.FB, { doc: (db, ...p) => ({ path: p.join('/') }), collection: nop, query: nop, orderBy: nop, limitToLast: nop, onSnapshot: () => () => {}, getDoc: async () => snap, getDocs: async () => snap,
      setDoc: async (ref, d) => { window.__writes.push([ref.path, d]); }, deleteDoc: async ref => { window.__writes.push([ref.path, null]); }, runTransaction: async () => {}, serverTimestamp: () => 0, deleteField: () => null,
      writeBatch: () => ({ set() {}, delete() {}, commit: async () => {} }) });
    window.botSay = async () => {}; window.notifyTeam = async () => {}; window.apiPost = async () => ({ ok: true });
    const st = demoState();
    const ch = { id: 'c1', name: 'KaraKurt', cls: 'warrior', nation: 'karus', level: 83, server: 'Zero', data: charDataFrom(st) };
    const ch2 = { id: 'c2', name: 'Şifacı', cls: 'priest', nation: 'karus', level: 72, server: 'Zero', data: newCharData(72) };
    DB.shared.events = presetEvents(); DB.shared.prices = st.prices; Object.assign(DB.shared.settings, st.settings);
    CUR.acc = { chars: [ch, ch2] }; CUR.ch = ch; bindView();
    CLOUD.user = { uid: 'u1', displayName: 'Caner', email: 'c@x.com', getIdToken: async () => 'x' }; CLOUD.db = {};
    TEAM.code = 'ABCD2345'; TEAM.loaded = true; TEAM.rulesChecked = true;
    TEAM.doc = { name: 'Gece Farmcıları', owner: 'u1', memberUids: ['u1', 'u2', 'u3'], members: {
      u1: { name: 'Caner', main: 'c1', chars: [ch] },
      u2: { name: 'Ali', main: 'a', chars: [{ id: 'a', name: 'Gölge', cls: 'rogue', nation: 'karus', level: 81 }] },
      u3: { name: 'Veli', main: 'v', chars: [{ id: 'v', name: 'Ateş', cls: 'mage', nation: 'karus', level: 79 }] } } };
    EP.code = 'ABCD2345'; EP.loaded = true; EP.unsub = () => {}; EP.list = [];
    LF.unsub = () => {}; LF.loaded = true; LF.list = [];
    if (typeof hideAuth === 'function') hideAuth();
  });
  return { pg, errors };
}

test('tüm sayfalar: hata, boş içerik ve yatay taşma yok', async () => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const { pg, errors } = await openApp(w, h);
    const ids = await pg.evaluate(() => PAGES.filter(p => p.id).map(p => p.id));
    assert.ok(ids.length >= 25, 'sayfa listesi');
    for (const id of ids) {
      const r = await pg.evaluate(id => {
        if (typeof hideAuth === 'function') hideAuth();
        ui.page = id; render();
        const c = document.getElementById('content');
        return { len: c.innerText.trim().length, over: document.documentElement.scrollWidth > innerWidth + 1 };
      }, id);
      assert.ok(r.len >= 20, `${w}px ${id}: içerik boş`);
      assert.ok(!r.over, `${w}px ${id}: yatay taşma`);
    }
    assert.deepEqual(errors, [], `${w}px sayfa hataları`);
    await pg.close();
  }
});

test('günlük görevler: işaretle, başka karakter, sıfırlanma, madde ekle/sil', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 30)), [a, b] = CUR.acc.chars, out = {};
    ui.page = 'gunluk'; render();
    document.querySelector('input[data-td="cz"][data-td-ch="c1"]').click(); await wait();
    out.done = todoIsDone(todoOf(a), { id: 'cz', per: 'g' });
    document.querySelector('input[data-td="bdw"][data-td-ch="c2"]').click(); await wait();
    out.other = todoIsDone(todoOf(b), { id: 'bdw', per: 'g' }) && !todoIsDone(todoOf(a), { id: 'bdw', per: 'g' });
    DB.shared.todoReset = { h: 5, d: 1 };
    const t = new Date(); t.setHours(3, 0, 0, 0); const prev = new Date(t); prev.setDate(t.getDate() - 1);
    out.reset = todoDayKey(t.getTime()) === localDate(prev);
    out.week = new Date(todoWeekKey(t.getTime()).slice(1) + 'T12:00').getDay() === 1;
    ACTIONS['td-edit'](); ACTIONS['td-add'](); document.querySelector('#mform [name=t]').value = 'Test maddesi'; ACTIONS['modal-save']();
    const it = todoOf(a).items.find(x => x.t === 'Test maddesi'); out.add = !!it;
    document.querySelector(`[data-act="td-del"][data-id="${it.id}"]`).click(); out.del = !todoOf(a).items.some(x => x.t === 'Test maddesi');
    DB.shared.todoReset = { h: 0, d: 1 };
    return out;
  });
  assert.deepEqual(r, { done: true, other: true, reset: true, week: true, add: true, del: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('grind: duraklatma, seviye atlamalı EXP, defter kaydı, geri bitiş reddi', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 30)), out = {};
    CUR.ch.level = 70; CUR.ch.data = newCharData(70); bindView();
    ui.page = 'grind'; render();
    document.querySelector('#grPlace').value = 'Eslant'; document.querySelector('#grPct').value = '40'; ACTIONS['gr-start']();
    const g = grindOf(); g.live.st -= 90 * 60000; ACTIONS['gr-pause'](); g.live.pauseAt -= 10 * 60000; ACTIONS['gr-pause']();
    out.pause = Math.abs(grElapsed(g.live) / 60000 - 80) < 1;
    ACTIONS['gr-finish'](); await wait();
    const f = n => document.querySelector(`#mform [name=${n}]`);
    f('lv2').value = '71'; f('b').value = '10'; f('noah').value = '120m'; f('cost').value = '20m'; ACTIONS['modal-save'](); await wait();
    const x = g.list[0];
    out.exp = Math.abs(x.exp - (xpNeed(70) * 0.6 + xpNeed(71) * 0.1)) < 2;
    out.level = CUR.ch.level === 71;
    out.kasa = S.tx.some(t => t.type === 'gelir' && t.amount === 100e6);
    g.live = { st: Date.now() - 600000, lv: 71, pct: 50, place: '', pausedMs: 0, pauseAt: 0 };
    ACTIONS['gr-finish'](); await wait(); f('b').value = '30'; ACTIONS['modal-save'](); await wait();
    out.reject = !!g.live && g.list.length === 1; closeModal();
    return out;
  });
  assert.deepEqual(r, { pause: true, exp: true, level: true, kasa: true, reject: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('ekip planı: yoklama, adil sıra, zar, katılım tablosu, partiye aktarma', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 30)), out = {}, now = Date.now();
    EP.list = [
      { id: 'old', t: 'Eski', at: now - 3 * 864e5, by: 'u1', rsvp: { u1: { s: 'y' }, u2: { s: 'y' } }, loot: [{ i: 'X', w: 'u2', wn: 'Gölge', m: 'zar', r: {}, at: 1 }] },
      { id: 'p', t: 'Krowaz', ev: 'krw', at: now - 2 * 3600e3, by: 'u1', rsvp: { u1: { s: 'y', cn: 'KaraKurt' }, u2: { s: 'y', cn: 'Gölge' }, u3: { s: 'm' } } },
    ];
    window.elSave = async (p, patch) => { Object.assign(p, patch); render(); };
    EP.showPast = true; ui.page = 'planla'; render();
    document.querySelector('[data-act="el-att"][data-id="p"][data-uid="u3"]').click(); await wait();
    document.querySelector('[data-act="el-att"][data-id="p"][data-uid="u2"]').click(); await wait();
    out.att = JSON.stringify(elCame(EP.list[1]).sort()) === '["u1","u3"]';
    EL.item.p = 'Iron Bar'; elGive(EP.list[1], 'sira'); EL.item.p = 'Iron Bar'; elGive(EP.list[1], 'sira');
    const [l1, l2] = EP.list[1].loot; out.fair = l1.w !== l2.w && ['u1', 'u3'].includes(l1.w);
    EL.item.p = 'Gem'; elGive(EP.list[1], 'zar'); const l3 = EP.list[1].loot[2];
    out.dice = l3.r[l3.w] === Math.max(...Object.values(l3.r));
    const d = document.createElement('div'); d.innerHTML = epStatsCard(now);
    const row = [...d.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Gölge')).querySelectorAll('td');
    out.stats = row[1].textContent.trim() === '1/2' && row[3].textContent.trim() === '1';
    elToParty(EP.list[1]); const pt = S.parties[S.parties.length - 1];
    out.party = pt.members.length === 2 && pt.drops.length === 3 && pt.drops.every(x => pt.members.some(m => m.id === x.looter));
    return out;
  });
  assert.deepEqual(r, { att: true, fair: true, dice: true, stats: true, party: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('ekip bul: süzgeçler, katılma, ilan alanları kurallarla uyumlu', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 30)), out = {}, now = Date.now();
    let joined = ''; window.teamJoin = async c => { joined = c; };
    TEAM.doc = null; TEAM.code = '';
    LF.list = [
      { id: 'u2', k: 'uye', srv: 'Zero', nat: 'karus', cls: ['priest'], lv: 75, ws: 'Akşam', note: '', contact: 'G', n: 'A', cn: 'G', tn: 'Ekip', code: 'ABCD2345', cnt: 5, at: now - 3600e3, exp: now + 864e5 },
      { id: 'u3', k: 'ekip', srv: 'Felis', nat: 'human', cls: ['mage'], lv: 79, ws: 'Gece', note: '', contact: 'd', n: 'V', cn: 'Ateş', tn: '', code: '', cnt: 0, at: now - 6e5, exp: now + 864e5 },
      { id: 'u5', k: 'ekip', srv: 'Zero', nat: 'karus', cls: ['rogue'], lv: 70, ws: 'Akşam', note: '', contact: 'x', n: 'Z', cn: 'Eski', tn: '', code: '', cnt: 0, at: now - 9 * 864e5, exp: now - 864e5 },
    ];
    ui.page = 'lfg'; render();
    out.expired = document.querySelectorAll('.lf-card').length === 2;
    LF.f.srv = 'Felis'; render(); out.filter = document.querySelectorAll('.lf-card').length === 1; LF.f.srv = ''; render();
    document.querySelector('[data-act="lf-join"]').click(); await wait(); ACTIONS['modal-save'](); await wait();
    out.join = joined === 'ABCD2345';
    ui.page = 'lfg'; render(); ACTIONS['lf-new']({ dataset: { k: 'ekip' } }); await wait();
    document.querySelector('#mform [name=contact]').value = 'KaraKurt'; ACTIONS['modal-save'](); await wait();
    const w = __writes.find(x => x[0] === 'kohesapLfg/u1');
    const keys = ['k', 'srv', 'nat', 'cls', 'lv', 'ws', 'note', 'contact', 'n', 'cn', 'tn', 'code', 'cnt', 'at', 'exp'];
    out.shape = !!w && Object.keys(w[1]).length === keys.length && Object.keys(w[1]).every(k => keys.includes(k)) && w[1].exp - w[1].at === 7 * 864e5;
    return out;
  });
  assert.deepEqual(r, { expired: true, filter: true, join: true, shape: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('GB geçmişi ve alarmı, boss çıkış penceresi', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const out = {}, notes = []; window.localNotify = (t, b) => notes.push(t + b);
    S.settings.server = 'Zero';
    const mk = (sell, buy) => ({ servers: ['Zero'], rows: [{ site: 'A', prices: { Zero: { sell, buy } } }], updated: '', time: 'x', ts: Date.now() });
    DB.shared.gbHist = {}; DB.shared.gbAlarm = { on: true, srv: 'Zero', below: 315, above: 0 };
    S.gbMarket = mk(320, 300); applyGB(); S.gbMarket = mk(310, 305); applyGB();
    const t = DB.shared.gbHist.Zero.slice(-1)[0]; out.hist = t[1] === 310 && t[2] === 305;
    out.alarm = notes.length === 1; applyGB(); out.once = notes.length === 1;
    const iv = BOSS_IV, now = Date.now();
    BOSS.key = 'ABCD2345/' + srvKey(bossSrv()); BOSS.unsub = () => {};
    BOSS.doc = { b: { talos: { k: now - iv * 1000 + 30 * 60000, iv, n: 'Talos', dv: [-4, 7] } } };
    const w = bossWin(bossById('talos')); out.win = !!w && Math.round((w.hi - w.lo) / 60000) === 11;
    ui.page = 'boss'; render(); out.card = /ekip verisi \(2\)/.test(document.querySelector('[data-boss="talos"]').textContent);
    return out;
  });
  assert.deepEqual(r, { hist: true, alarm: true, once: true, win: true, card: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('item basma: kayıtlı günlük açılır, topluluk sütunu ve anonim paylaşım', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 60)), out = {}, dels = [];
    const docs = [{ data: () => ({ s: { 'bus|5': [100, 53] }, at: 1 }) }, { data: () => ({ s: { 'bus|5': [20, 11], 'bad|x': [-1, 5] }, at: 2 }) }];
    Object.assign(window.FB, { getDocs: async () => ({ docs }), deleteDoc: async ref => { dels.push(ref.path); } });
    const A = anv(); A.cfg.tab = 'gunluk'; A.share = false;
    A.log = [{ id: 1, date: localDate(), item: 'Raptor', scroll: 'bus', lv: 5, ok: true }, { id: 2, date: localDate(), item: 'Raptor', scroll: 'bus', lv: 5, ok: false }];
    ui.page = 'basma'; render(); await wait();
    const html = document.getElementById('content').innerHTML;
    out.col = /Topluluk<\/th>/.test(html) && /%53,3/.test(html) && /120 deneme/.test(html);
    document.querySelector('[data-ac-share]').click(); await wait();
    const w = __writes.find(x => x[0] === 'kohesapAnvil/u1');
    out.share = !!w && JSON.stringify(w[1].s) === JSON.stringify({ 'bus|5': [2, 1] }) && Object.keys(w[1]).join() === 's,at';
    document.querySelector('[data-ac-share]').click(); await wait();
    out.unshare = dels.includes('kohesapAnvil/u1');
    return out;
  });
  assert.deepEqual(r, { col: true, share: true, unshare: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('hedef listesi: fiyat listesinden fiyat, alındı, biriktirilen, eksik, kopyala', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 30)), out = {}, [a, b] = CUR.acc.chars;
    ui.page = 'hedef'; render();
    out.empty = /Hedef listen boş/.test(document.getElementById('content').innerText);
    const f = n => document.querySelector(`#mform [name=${n}]`);
    ACTIONS['hd-add'](); f('name').value = 'Krowaz Ring'; f('qty').value = '2'; f('grp').value = 'Takı'; ACTIONS['modal-save']();
    ACTIONS['hd-add'](); f('name').value = 'Raptor +7'; f('unit').value = '300m'; f('grp').value = 'Silah'; ACTIONS['modal-save']();
    ACTIONS['hd-add'](); f('name').value = 'Bilinmeyen Item'; ACTIONS['modal-save']();
    const h = hedefOf(a);
    let t = hdTotals(h);
    out.total = t.all === 95e6 * 2 + 300e6 && t.missing === 1;
    document.querySelector(`[data-hd-done="${h.list[1].id}"]`).click(); await wait();
    const sv = document.querySelector('[data-hd-saved]'); sv.value = '100m'; sv.dispatchEvent(new Event('change', { bubbles: true })); await wait();
    t = hdTotals(h);
    out.need = t.done === 300e6 && t.left === 190e6 && t.need === 90e6;
    out.view = /Eksik para/.test(document.getElementById('content').textContent) && /fiyat yok/.test(document.getElementById('content').textContent);
    S.prices.find(x => x.name === 'Krowaz Ring').price = 80e6;
    out.live = hdTotals(h).left === 160e6;
    ACTIONS['hd-copy'](); ACTIONS['modal-save']();
    out.copy = hedefOf(b).list.length === 3 && hedefOf(b).list.every(x => !x.done);
    document.querySelector(`[data-act="hd-del"][data-id="${h.list[2].id}"]`).click(); out.del = h.list.length === 2;
    return out;
  });
  assert.deepEqual(r, { empty: true, total: true, need: true, view: true, live: true, copy: true, del: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('kompozisyon: eksik rol için alt karakter önerisi, seviye şartı, sınıf dağılımı', async () => {
  const { pg, errors } = await openApp();
  const r = await pg.evaluate(async () => {
    const out = {}, now = Date.now();
    TEAM.doc.members.u3.chars.push({ id: 'v2', name: 'Şifa', cls: 'priest', nation: 'karus', level: 74 });
    const p = { id: 'j', t: 'Juraid', ev: 'jr', at: now + 3600e3, by: 'u1', rsvp: {
      u1: { s: 'y', c: 'c1', cn: 'KaraKurt', cls: 'warrior', lv: 83 },
      u2: { s: 'y', c: 'a', cn: 'Gölge', cls: 'rogue', lv: 65 },
      u3: { s: 'y', c: 'v', cn: 'Ateş', cls: 'mage', lv: 79 } } };
    const tips = epTips(epRows(p), p).join(' ');
    out.priest = /Priest yok/.test(tips) && /Veli → Şifa \(Lv 74\)/.test(tips);
    out.level = /Gölge \(Lv 65\) giremeyebilir/.test(tips) && !/KaraKurt \(Lv/.test(tips);
    EP.list = [p]; EP.showPast = false; ui.page = 'planla'; render();
    out.comp = /1 Warrior/.test(document.querySelector('.ep-comp').textContent);
    ui.page = 'ekip'; render();
    out.team = /Alt karakter olarak var: Veli: Şifa/.test(document.getElementById('content').textContent);
    return out;
  });
  assert.deepEqual(r, { priest: true, level: true, comp: true, team: true });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('hızlı arama: Ctrl+K, Türkçe harfsiz arama, oklar, Enter, hedefe ekle', async () => {
  const { pg, errors } = await openApp();
  await pg.keyboard.press('Control+k');
  const out = {};
  out.open = await pg.evaluate(() => !document.getElementById('pal').hidden && document.activeElement.id === 'palQ');
  await pg.keyboard.type('gunluk gorev');
  out.first = await pg.evaluate(() => document.querySelector('.pal-it.on b').textContent);
  await pg.keyboard.press('Enter');
  out.page = await pg.evaluate(() => ui.page + '|' + document.getElementById('pal').hidden);
  await pg.keyboard.press('Control+k'); await pg.keyboard.type('juraid');
  await pg.keyboard.press('Enter');
  out.guide = await pg.evaluate(() => ui.page + '|' + !!document.querySelector('details[data-gd="jr"][open]'));
  await pg.keyboard.press('Control+k'); await pg.keyboard.type('Raptor +7');
  out.last = await pg.evaluate(() => [...document.querySelectorAll('.pal-it b')].pop().textContent);
  await pg.evaluate(() => [...document.querySelectorAll('.pal-it')].pop().click());
  out.hedef = await pg.evaluate(() => ui.page + '|' + document.querySelector('#mform [name=name]').value);
  await pg.evaluate(() => closeModal());
  await pg.keyboard.press('Control+k'); await pg.keyboard.press('Escape');
  out.esc = await pg.evaluate(() => document.getElementById('pal').hidden);
  assert.deepEqual(out, { open: true, first: 'Günlük Görevler', page: 'gunluk|true', guide: 'rehber|true', last: '"Raptor +7" hedef listesine ekle', hedef: 'hedef|Raptor +7', esc: true });
  assert.deepEqual(errors, []);
  await pg.close();
});
