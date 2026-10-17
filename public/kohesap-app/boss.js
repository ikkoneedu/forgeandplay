'use strict';
/* ==========================================================================
   BOSS ALARMI
   - Knight Online'da boss'ların çoğu sabit saatte değil, öldükten (ya da sunucu
     yeniden başladıktan) belli süre sonra çıkar. Ekipten biri "öldü" işaretler,
     sonraki çıkış hesaplanır; herkes 10 dk önce bildirim alır.
   - Sayaçlar ekip içinde, seçilen sunucuya göre paylaşılır:
       kohesapTeams/{kod}/boss/{sunucu} → { b: { bossId: { k, iv, n, by, r } }, restart, at, by }
   - Süreler oyunun canavar tablosundan: ucuzagb.com boss saatleri rehberi (13.09.2026),
     etkinlik boss'ları: ucuzagb.com etkinlik saatleri (12.10.2026).
   ========================================================================== */
const BOSS_IV = 32000; // 8 sa 53 dk 20 sn
const BOSS_ZONES = [
  { id: 'eslant', t: 'Eslant', d: 'Karus ve El Morad Eslant · aynı nokta sayısıyla iki tarafta da çıkar' },
  { id: 'ardream', t: 'Ardream', d: 'Orta seviye boss\'lar' },
  { id: 'luferson', t: 'Luferson Castle', d: 'Yalnızca Karus tarafı' },
  { id: 'dungeon', t: 'Zindan & Ronark Land', d: 'Kısa süreli sayaçlar' },
  { id: 'event', t: 'Etkinlik boss\'ları', d: 'Sabit saatte ya da duyuruyla çıkar; çıkınca ekibe haber ver' },
];
const BOSSES = [
  { id: 'talos', n: 'Talos', lv: 140, z: 'eslant', iv: BOSS_IV, sp: 16, hp: '220.000' },
  { id: 'trollking', n: 'Troll King', lv: 110, z: 'eslant', iv: BOSS_IV, sp: 12, hp: '233.025' },
  { id: 'harpyq', n: 'Harpy Queen', lv: 110, z: 'eslant', iv: BOSS_IV, sp: 8, hp: '179.998' },
  { id: 'deruvish', n: 'Deruvish Founder', lv: 100, z: 'eslant', iv: BOSS_IV, sp: 12, hp: '150.000' },
  { id: 'snakeq', n: 'Snake Queen', lv: 100, z: 'eslant', iv: BOSS_IV, sp: 16, hp: '150.000' },
  { id: 'samma', n: 'Samma', lv: 90, z: 'eslant', iv: BOSS_IV, sp: 13, hp: '104.370', note: 'Ardream\'da da görülür' },
  { id: 'dragontooth', n: 'Dragon Tooth', lv: 80, z: 'eslant', iv: BOSS_IV, sp: 8, hp: '76.380' },
  { id: 'shaula', n: 'Shaula', lv: 75, z: 'eslant', iv: BOSS_IV, sp: 10, hp: '64.485', note: 'Ardream\'da da görülür' },
  { id: 'attila', n: 'Attila', lv: 85, z: 'ardream', iv: BOSS_IV, sp: 2, hp: '89.650' },
  { id: 'lesath', n: 'Lesath', lv: 75, z: 'ardream', iv: BOSS_IV, sp: 1, hp: '64.485' },
  { id: 'bishop', n: 'Bishop', lv: 65, z: 'ardream', iv: BOSS_IV, sp: 3, hp: '44.520' },
  { id: 'bach', n: 'Bach', lv: 60, z: 'ardream', iv: BOSS_IV, sp: 4, hp: '36.300' },
  { id: 'barkirra', n: 'Barkirra', lv: 60, z: 'ardream', iv: BOSS_IV, sp: 5, hp: '36.300' },
  { id: 'barrkk', n: 'Barrkk', lv: 55, z: 'ardream', iv: BOSS_IV, sp: 4, hp: '29.155' },
  { id: 'duke', n: 'Duke', lv: 55, z: 'ardream', iv: BOSS_IV, sp: 3, hp: '29.155' },
  { id: 'lycaon', n: 'Lycaon', lv: 55, z: 'ardream', iv: BOSS_IV, sp: 2, hp: '29.155' },
  { id: 'lupus', n: 'Lupus', lv: 50, z: 'ardream', iv: BOSS_IV, sp: 2, hp: '23.010' },
  { id: 'lobo', n: 'Lobo', lv: 45, z: 'ardream', iv: BOSS_IV, sp: 2, hp: '17.790' },
  { id: 'antares', n: 'Antares', lv: 50, z: 'luferson', iv: BOSS_IV, sp: 5, hp: '23.010' },
  { id: 'hyde', n: 'Hyde', lv: 45, z: 'luferson', iv: BOSS_IV, sp: 5, hp: '17.790' },
  { id: 'isiloon', n: 'Isiloon (Hell Abyss)', lv: 170, z: 'dungeon', iv: BOSS_IV, sp: 1, hp: '1.300.015' },
  { id: 'isiloonlair', n: 'Isiloon (Isillion Lair)', lv: 170, z: 'dungeon', iv: 3600, sp: 1 },
  { id: 'chaosstone', n: 'Chaos Stone', lv: 0, z: 'dungeon', iv: 7200, sp: 0, note: 'Ronark Land' },
  { id: 'ronarkelite', n: 'Ronark Land elitleri', lv: 0, z: 'dungeon', iv: 14400, sp: 0, note: 'Orc Bandit Leader dahil' },
  { id: 'ultima', n: 'Ultima (Ultima\'s Dungeon)', lv: 80, z: 'event', fixed: { d: [0, 1, 2, 3, 4, 5, 6], t: ['10:00', '21:30'] }, note: 'Etkinlik rotasyonda olduğu ay · 30 dk süre · Premium ya da 50 Ladder puanı' },
  { id: 'devabird', n: 'Deva Bird (Juraid)', lv: 70, z: 'event', fixed: { d: [0, 1, 2, 3, 4, 5, 6], t: ['07:40', '22:40'] }, note: 'Juraid Mountain etkinliğinde' },
  { id: 'felankor', n: 'Felankor', lv: 230, z: 'event', note: 'Sayaçla değil, etkinlik / duyuruyla çıkar · 2-3 parti' },
];
const BOSS_SRC = 'Süreler: ucuzagb.com boss rehberi (13.09.2026) · etkinlikler: ucuzagb.com (12.10.2026)';
const bossById = id => BOSSES.find(b => b.id === id);

const BPREF_KEY = 'koekip-boss';
const BOSS = Object.assign({ server: '', bells: null, lead: 10, unsub: null, key: '', doc: null, err: '', edit: '', restartEdit: false, notified: {} },
  (() => { try { return JSON.parse(localStorage.getItem(BPREF_KEY) || '{}'); } catch { return {}; } })());
BOSS.notified = {};
const bossSave = () => { try { localStorage.setItem(BPREF_KEY, JSON.stringify({ server: BOSS.server, bells: BOSS.bells, lead: BOSS.lead })); } catch { } };
const bossSrv = () => BOSS.server || (CUR.ch && CUR.ch.server) || S.settings.server || DEFAULT_SERVERS[0];
const srvKey = s => String(s || '').trim().replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü _-]/g, '').slice(0, 24) || 'Sunucu';
const bossRef = (code, srv) => FB.doc(CLOUD.db, 'kohesapTeams', code, 'boss', srvKey(srv));
const bellOn = id => !BOSS.bells || BOSS.bells.includes(id);

function bossWatch() {
  const key = TEAM.doc && CLOUD.db ? TEAM.code + '/' + srvKey(bossSrv()) : '';
  if (key === BOSS.key) return;
  if (BOSS.unsub) { try { BOSS.unsub(); } catch { } BOSS.unsub = null; }
  BOSS.key = key; BOSS.doc = null; BOSS.err = '';
  if (!key) return;
  BOSS.unsub = FB.onSnapshot(bossRef(TEAM.code, bossSrv()), s => { BOSS.doc = s.exists() ? s.data() : {}; bossPaint(); },
    e => { BOSS.err = isPermErr(e) ? 'Boss sayaçları için Firebase kurallarının güncel hali yayınlanmalı.' : e.message; if (isPermErr(e)) TEAM.rulesMissing = true; bossPaint(); });
}
const bossRec = id => (BOSS.doc && BOSS.doc.b && BOSS.doc.b[id]) || null;
/** sonraki çıkış (ms) ya da null */
function bossNext(b, now = Date.now()) {
  if (b.fixed) {
    const d = new Date(now); d.setSeconds(0, 0);
    for (let i = 0; i < 8; i++) {
      const day = new Date(d); day.setDate(d.getDate() + i);
      if (!b.fixed.d.includes(day.getDay())) continue;
      for (const t of b.fixed.t) { const [h, m] = t.split(':').map(Number); const at = new Date(day); at.setHours(h, m, 0, 0); if (at.getTime() > now - 60000) return at.getTime(); }
    }
    return null;
  }
  const r = bossRec(b.id);
  if (!r || !r.k || !b.iv) return null;
  return r.k + b.iv * 1000;
}
function bossState(b, now = Date.now()) {
  const r = bossRec(b.id), next = bossNext(b, now);
  if (b.fixed) return { kind: 'fixed', next, r };
  if (!b.iv) return { kind: 'manual', next: null, r };
  if (!r || !r.k) return { kind: 'unknown', next: null, r };
  return { kind: now >= next ? 'up' : 'wait', next, r };
}
const clock = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const dayClock = ms => { const d = new Date(ms), t = new Date(); const sameDay = d.toDateString() === t.toDateString(); const tm = new Date(t); tm.setDate(t.getDate() + 1); return (sameDay ? '' : d.toDateString() === tm.toDateString() ? 'yarın ' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ') + clock(ms); };
const ivText = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ' sa ' : '') + (m ? m + ' dk' : '') + (ss ? ' ' + ss + ' sn' : ''); };

/* ---------- yazma ---------- */
async function bossWrite(patch, msg) {
  if (!TEAM.doc) return toast('Önce bir ekibe katıl', 'err');
  try { await FB.setDoc(bossRef(TEAM.code, bossSrv()), { ...patch, at: Date.now(), by: myUid() }, { merge: true }); if (msg) toast(msg, 'ok'); }
  catch (e) { toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'); }
}
const whoShort = () => (CUR.ch && CUR.ch.name) || (CLOUD.user && CLOUD.user.displayName) || '';
function bossKill(id, at) {
  const b = bossById(id); if (!b || !b.iv) return;
  const k = at || Date.now();
  return bossWrite({ b: { [id]: { k, iv: b.iv, n: b.n, by: whoShort().slice(0, 30) } } }, `${b.n}: sonraki çıkış ~${dayClock(k + b.iv * 1000)}`);
}
function bossClear(id) { return bossWrite({ b: { [id]: FB.deleteField() } }, 'Sayaç silindi'); }
function bossRestart(at) {
  const b = {};
  BOSSES.filter(x => x.iv).forEach(x => { b[x.id] = { k: at, iv: x.iv, n: x.n, by: whoShort().slice(0, 30), r: 1 }; });
  return bossWrite({ b, restart: at }, 'Tüm sayaçlar sunucu açılışına göre kuruldu');
}
/* "Çıktı!" → ekip yazışmasına bot mesajı + ekibe anlık bildirim */
async function bossAnnounce(id) {
  const b = bossById(id); if (!b || !TEAM.doc) return;
  const srv = bossSrv();
  const txt = `🐉 **${b.n}** çıktı! (${srv}${b.z !== 'event' ? ' · ' + (BOSS_ZONES.find(z => z.id === b.z) || {}).t : ''}) — ${whoShort()}`;
  if (typeof botSay === 'function') botSay(txt, 'boss').catch(() => { });
  if (typeof notifyTeam === 'function') notifyTeam('boss', { boss: b.n, server: srv });
  toast(`${b.n} ekibe duyuruldu`, 'ok');
}
/* "SS:DD" → bugün (gelecekteyse dün) */
function parseHM(v) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v || '').trim()); if (!m) return null;
  const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/* ---------- uygulama açıkken yerel alarm (telefona gelen bildirim bunun yerine geçer) ---------- */
function bossTick() {
  if (!TEAM.doc) return;
  bossWatch();
  const now = Date.now(), lead = (BOSS.lead || 10) * 60000;
  BOSSES.forEach(b => {
    if (!bellOn(b.id) || (!b.iv && !b.fixed)) return;
    const next = bossNext(b, now); if (!next) return;
    const dt = next - now, k1 = b.id + '@' + next;
    if (dt > 0 && dt <= lead && !BOSS.notified[k1]) {
      BOSS.notified[k1] = 1;
      const msg = `${b.n} ${Math.max(1, Math.round(dt / 60000))} dk sonra çıkıyor (~${clock(next)} · ${bossSrv()})`;
      if (typeof localNotify === 'function') localNotify('🐉 Boss alarmı', msg, 'boss-' + b.id); else toast('🐉 ' + msg);
    }
    if (dt <= 0 && dt > -60000 && !BOSS.notified[k1 + 'u'] && !b.fixed) { BOSS.notified[k1 + 'u'] = 1; toast(`🐉 ${b.n} şimdi çıkmış olmalı (${bossSrv()})`); }
  });
  if (ui.page === 'boss') bossPaintTimes();
}
setInterval(bossTick, 1000 * 15);

/* ---------- görünüm ---------- */
ICON.boss = I('<path d="M12 3c-4.4 0-8 3.1-8 7.5 0 2.4 1.1 4.5 2.9 5.9L6 21l3-1.5 1 1.5 2-2 2 2 1-1.5 3 1.5-.9-4.6c1.8-1.4 2.9-3.5 2.9-5.9C20 6.1 16.4 3 12 3z"/><circle cx="9" cy="10.5" r="1.4"/><circle cx="15" cy="10.5" r="1.4"/>');
const BELL = I('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>');
const BELL_OFF = I('<path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8"/><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18"/>');
PAGES.splice(PAGES.findIndex(p => p.id === 'event') + 1, 0, { id: 'boss', t: 'Boss Alarmı', d: 'Sunucuya göre boss sayaçları · ekip içinde paylaşılır · 10 dk önce bildirim' });

function bossCard(b, now) {
  const st = bossState(b, now), r = st.r, on = bellOn(b.id);
  let main = '', sub = '', cls = '';
  if (st.kind === 'wait') { main = `<span class="bs-cd" data-bnext="${st.next}">${fmtCD(st.next - now)}</span>`; sub = `~${dayClock(st.next)}'de çıkar`; cls = st.next - now <= (BOSS.lead || 10) * 60000 ? 'soon' : ''; }
  else if (st.kind === 'up') { main = '<span class="bs-up">Çıkmış olmalı</span>'; sub = `~${dayClock(st.next)}'den beri · öldürünce işaretle`; cls = 'up'; }
  else if (st.kind === 'fixed') { main = st.next ? `<span class="bs-cd" data-bnext="${st.next}">${fmtCD(Math.max(0, st.next - now))}</span>` : '—'; sub = 'Her gün ' + b.fixed.t.join(' ve '); cls = st.next && st.next - now <= (BOSS.lead || 10) * 60000 ? 'soon' : ''; }
  else if (st.kind === 'manual') { main = '<span class="bs-unk">Duyuruyla</span>'; sub = 'Sayaç yok'; }
  else { main = '<span class="bs-unk">Bilinmiyor</span>'; sub = 'Öldüğü saati gir'; }
  const lastTxt = r && r.k ? `${r.r ? 'Sunucu açılışı' : 'Öldü'} ${dayClock(r.k)}${r.by && !r.r ? ' · ' + esc(r.by) : ''}` : '';
  const editing = BOSS.edit === b.id;
  return `<div class="bs ${cls}" data-boss="${b.id}">
    <div class="bs-top">
      <div class="bs-name"><b>${esc(b.n)}</b><span>${b.lv ? 'Lv ' + b.lv : ''}${b.sp ? ' · ' + b.sp + ' nokta' : ''}${b.iv ? ' · ' + ivText(b.iv) : ''}</span></div>
      ${b.iv || b.fixed ? `<button class="icon-btn bs-bell ${on ? 'on' : ''}" data-act="b-bell" data-id="${b.id}" title="${on ? 'Alarm açık' : 'Alarm kapalı'}" aria-label="Alarm">${on ? BELL : BELL_OFF}</button>` : ''}
    </div>
    <div class="bs-mid">${main}<small>${sub}</small></div>
    ${lastTxt ? `<div class="bs-last"><span>${lastTxt}</span><button class="icon-btn bs-x" data-act="b-clear" data-id="${b.id}" title="Sayacı sil" aria-label="Sayacı sil">✕</button></div>` : b.note ? `<div class="bs-last">${esc(b.note)}</div>` : ''}
    ${editing ? `<div class="bs-edit"><input class="inp" type="time" data-bat value="${clock(Date.now())}" aria-label="Öldüğü saat"><button class="btn sm pri" data-act="b-kill-at" data-id="${b.id}">Kaydet</button><button class="btn sm ghost" data-act="b-edit" data-id="">Vazgeç</button></div>`
      : `<div class="bs-acts">
      ${b.iv ? `<button class="btn sm pri" data-act="b-kill" data-id="${b.id}" title="Şu an öldü">☠ Öldü</button><button class="btn sm" data-act="b-edit" data-id="${b.id}" title="Öldüğü saati gir">Saat gir</button>` : ''}
      <button class="btn sm" data-act="b-up" data-id="${b.id}" title="Ekibe 'çıktı' bildirimi gönder">📣 Çıktı</button>
    </div>`}
  </div>`;
}
VIEWS.boss = () => {
  if (!TEAM.doc) return `<div class="card">${empty('Boss alarmı ekip içinde çalışır', 'Sayaçlar ekip üyeleri arasında paylaşılır; biri öldürünce herkes sonraki çıkışı görür ve bildirim alır.')}<div style="text-align:center;margin-top:12px"><button class="btn pri" data-act="go" data-id="ekip">Ekip sayfasına git</button></div></div>`;
  bossWatch();
  const now = Date.now(), srv = bossSrv();
  const servers = [...new Set([...(S.gbMarket ? S.gbMarket.servers : []), ...DEFAULT_SERVERS, srv])];
  const upcoming = BOSSES.map(b => ({ b, st: bossState(b, now) })).filter(x => x.st.next && (x.st.kind === 'wait' || x.st.kind === 'fixed') && bellOn(x.b.id)).sort((a, b) => a.st.next - b.st.next).slice(0, 4);
  const ups = BOSSES.filter(b => bossState(b, now).kind === 'up');
  return (TEAM.rulesMissing && typeof rulesBox === 'function' ? rulesBox() : '') + (typeof notifyBanner === 'function' ? notifyBanner() : '') + `
  <section class="bs-hero card">
    <div class="bs-hero-l">
      <div class="bs-hero-ic">${ICON.boss}</div>
      <div><h3>${esc(TEAM.doc.name || 'Ekip')} · boss sayaçları</h3>
      <span class="mut">Biri boss'u kesince <b>☠ Öldü</b>'ye basar; sonraki çıkış hesaplanır ve ekipteki herkese <b>${BOSS.lead || 10} dk önce</b> bildirim gider.</span></div>
    </div>
    <div class="bs-hero-r">
      <label class="f">Sunucu<select class="inp" data-bsrv>${servers.map(s => `<option ${s === srv ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f">Önceden haber<select class="inp" data-blead>${[5, 10, 15, 20, 30].map(m => `<option value="${m}" ${m === (BOSS.lead || 10) ? 'selected' : ''}>${m} dk</option>`).join('')}</select></label>
    </div>
  </section>
  ${BOSS.err ? `<div class="callout r" style="margin:12px 0">${esc(BOSS.err)}</div>` : ''}
  <div class="bs-strip">
    ${upcoming.length ? upcoming.map(x => `<div class="bs-chip"><b>${esc(x.b.n)}</b><span data-bnext="${x.st.next}">${fmtCD(Math.max(0, x.st.next - now))}</span><small>~${dayClock(x.st.next)}</small></div>`).join('') : '<div class="bs-chip empty">Sayacı kurulmuş boss yok · ilk öldürmeyi işaretle</div>'}
    ${ups.length ? `<div class="bs-chip up"><b>${ups.length} boss çıkmış olmalı</b><small>${esc(ups.slice(0, 3).map(b => b.n).join(', '))}${ups.length > 3 ? '…' : ''}</small></div>` : ''}
  </div>
  <div class="bs-restart card">
    <div><b>Sunucu bakımdan / yeniden başlatmadan çıktı mı?</b><span class="mut"> Sayaçlar sunucu açılınca sıfırlanır; açılış saatini girersen tüm boss'lar ona göre kurulur.</span></div>
    ${BOSS.restartEdit ? `<div class="bs-edit"><input class="inp" type="time" data-brs value="${clock(Date.now())}" aria-label="Sunucu açılış saati"><button class="btn sm pri" data-act="b-restart">Tümünü kur</button><button class="btn sm ghost" data-act="b-restart-edit">Vazgeç</button></div>`
      : `<button class="btn sm" data-act="b-restart-edit">Açılış saatini gir</button>`}
  </div>
  ${BOSS_ZONES.map(z => `<section class="bs-zone">
    <div class="bs-zh"><h3>${esc(z.t)}</h3><span class="mut">${esc(z.d)}</span></div>
    <div class="bs-grid">${BOSSES.filter(b => b.z === z.id).map(b => bossCard(b, now)).join('')}</div>
  </section>`).join('')}
  <p class="hint" style="margin-top:14px">${esc(BOSS_SRC)}. Sayaçlar her döngüde ~53 dk kayar; birkaç dakikalık sapma olabilir. Sayaçlar ${esc(srv)} sunucusu ve bu ekip için geçerli.</p>`;
};
function bossPaintTimes() {
  const now = Date.now();
  document.querySelectorAll('[data-bnext]').forEach(el => { el.textContent = fmtCD(Math.max(0, +el.dataset.bnext - now)); });
}
function bossPaint() { if (ui.page === 'boss') { const a = document.activeElement; if (a && (a.dataset.bat != null || a.dataset.brs != null)) return; render(); } }
setInterval(() => { if (ui.page === 'boss') bossPaintTimes(); }, 1000);

Object.assign(ACTIONS, {
  'b-kill': el => bossKill(el.dataset.id),
  'b-edit': el => { BOSS.edit = el.dataset.id; render(); const i = document.querySelector('[data-bat]'); if (i) i.focus(); },
  'b-kill-at': el => { const v = document.querySelector('[data-bat]'); const at = parseHM(v && v.value); if (!at) return toast('Saat SS:DD biçiminde olmalı', 'err'); BOSS.edit = ''; bossKill(el.dataset.id, at); render(); },
  'b-clear': el => bossClear(el.dataset.id),
  'b-up': el => bossAnnounce(el.dataset.id),
  'b-bell': el => {
    const id = el.dataset.id;
    const all = BOSSES.filter(b => b.iv || b.fixed).map(b => b.id);
    let list = BOSS.bells ? [...BOSS.bells] : all;
    list = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    BOSS.bells = list.length === all.length ? null : list; bossSave(); render();
    if (typeof notifySync === 'function') notifySync(true);
  },
  'b-restart-edit': () => { BOSS.restartEdit = !BOSS.restartEdit; render(); },
  'b-restart': () => { const v = document.querySelector('[data-brs]'); const at = parseHM(v && v.value); if (!at) return toast('Saat SS:DD biçiminde olmalı', 'err'); BOSS.restartEdit = false; bossRestart(at); render(); },
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.bsrv != null) { BOSS.server = e.target.value; bossSave(); bossWatch(); render(); if (typeof notifySync === 'function') notifySync(true); }
  if (d.blead != null) { BOSS.lead = +e.target.value || 10; bossSave(); render(); if (typeof notifySync === 'function') notifySync(true); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.dataset && e.target.dataset.bat != null) { const b = document.querySelector('[data-act="b-kill-at"]'); if (b) b.click(); }
  if (e.target.dataset && e.target.dataset.brs != null) { const b = document.querySelector('[data-act="b-restart"]'); if (b) b.click(); }
});
const _logoutB = logout;
logout = async function () { if (BOSS.unsub) { BOSS.unsub(); BOSS.unsub = null; } BOSS.key = ''; BOSS.doc = null; return _logoutB(); };
