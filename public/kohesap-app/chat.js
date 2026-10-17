'use strict';
/* ==========================================================================
   EKİP YAZIŞMASI + KO BOT
   Firestore: kohesapTeams/{kod}/chat/{id} → { u, n, c, cls, nat, race, t, at, ts, bot?, kind? }
   - Son 120 mesaj canlı izlenir; okunmamış sayısı menüde rozet olarak görünür.
   - "/" ile başlayan mesajlar bot komutudur; cevabı gönderenin uygulaması hesaplar
     ve ekibe "KO Bot" olarak yazar (sunucu gerekmez).
   - Lider açarsa bot, eventlerden 10 dk önce ekibe hatırlatma yazar (aynı hatırlatma
     bir kez yazılır: belge adı event+saatten oluşur).
   ========================================================================== */
const CHAT = { code: '', unsub: null, msgs: [], unread: 0, seen: 0, err: '', loaded: false, sending: false, draft: '', reply: null, newBelow: 0, lastCs: 0, csAt: 0 };
/* Sıralama SUNUCU saatine göre (ts): cihaz saatleri farklı olsa da mesajlar doğru sırada durur.
   Henüz sunucuya ulaşmamış mesaj (gönderiliyor) için tahmini saat kullanılır. */
const tsMs = (v, fb) => v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'string' ? (Date.parse(v) || fb || 0) : typeof v === 'number' ? v : (fb || 0);
const chatCol = code => FB.collection(CLOUD.db, 'kohesapTeams', code, 'chat');
const chatDoc = (code, id) => FB.doc(CLOUD.db, 'kohesapTeams', code, 'chat', id);
const seenKey = code => 'kohesap-chatseen-' + code;
const BOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/></svg>';

function chatWatch() {
  const code = TEAM.doc && CLOUD.db ? TEAM.code : '';
  if (code === CHAT.code) return;
  if (CHAT.unsub) { try { CHAT.unsub(); } catch { } CHAT.unsub = null; }
  CHAT.code = code; CHAT.msgs = []; CHAT.unread = 0; CHAT.loaded = false; CHAT.err = '';
  if (!code) { chatBadge(); return; }
  try { CHAT.seen = +localStorage.getItem(seenKey(code)) || 0; } catch { CHAT.seen = 0; }
  CHAT.unsub = FB.onSnapshot(FB.query(chatCol(code), FB.orderBy('ts'), FB.limitToLast(120)), { includeMetadataChanges: true }, snap => {
    const list = [];
    snap.forEach(d => {
      const v = d.data({ serverTimestamps: 'estimate' }) || {};
      const pend = !!(d.metadata && d.metadata.hasPendingWrites);
      list.push({ id: d.id, ...v, pend, st: tsMs(v.ts, v.at) });
    });
    // gönderilmekte olanlar her zaman en altta (WhatsApp gibi); sunucuya ulaşınca sunucu saatine göre yerleşir
    const key = m => m.pend ? 9e15 + (m.at || 0) : m.st;
    list.sort((a, b) => (key(a) - key(b)) || ((a.at || 0) - (b.at || 0)) || (a.id < b.id ? -1 : 1));
    const had = new Set(CHAT.msgs.map(m => m.id)), fresh = CHAT.loaded ? list.filter(m => !had.has(m.id)) : [];
    CHAT.msgs = list; CHAT.loaded = true;
    const viewing = ui.page === 'ses' && !document.hidden;
    if (viewing) chatMarkSeen();
    else CHAT.unread = list.filter(m => m.st > CHAT.seen && m.u !== myUid()).length;
    if (fresh.some(m => m.u !== myUid() || m.bot) && !viewing) chatPing();
    chatPaint(); chatBadge();
  }, e => { CHAT.err = isPermErr(e) ? 'Yazışma için Firebase kuralları yayınlanmamış.' : e.message; if (isPermErr(e)) TEAM.rulesMissing = true; CHAT.loaded = true; chatPaint(); });
}
setInterval(chatWatch, 3000);
function chatMarkSeen() {
  const lastM = [...CHAT.msgs].reverse().find(m => !m.pend);
  const last = lastM ? lastM.st : 0;
  if (last > CHAT.seen) { CHAT.seen = last; try { localStorage.setItem(seenKey(CHAT.code), String(last)); } catch { } }
  if (CHAT.unread) { CHAT.unread = 0; chatBadge(); }
  readReceipt(last);
}
/* "okundu" bilgisi (✓✓ mavi): ekip belgesinde kendi özetine son okunan mesaj saati yazılır (en sık 5 sn'de bir) */
function readReceipt(last) {
  if (!last || !TEAM.doc || !CHAT.code || document.hidden) return;
  const mine = ((TEAM.doc.members || {})[myUid()] || {}).cs || 0;
  if (last <= Math.max(mine, CHAT.lastCs)) return;
  const wait = 5000 - (Date.now() - CHAT.csAt);
  clearTimeout(CHAT.csTimer);
  CHAT.csTimer = setTimeout(() => {
    CHAT.csAt = Date.now(); CHAT.lastCs = Math.max(CHAT.lastCs, last);
    FB.setDoc(teamRef(CHAT.code), { members: { [myUid()]: { cs: CHAT.lastCs } } }, { merge: true }).catch(() => { });
  }, Math.max(0, wait));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.page === 'ses') chatMarkSeen(); });
function chatPing() {
  if (!VOICE.pref.sounds) return;
  try {
    const c = VOICE.ctx || (VOICE.ctx = new AudioContext()), t = c.currentTime;
    [880, 1175].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * .09); g.gain.exponentialRampToValueAtTime(0.05, t + i * .09 + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * .09 + .16); o.connect(g).connect(c.destination); o.start(t + i * .09); o.stop(t + i * .09 + .18); });
  } catch { }
}
/* menüde okunmamış rozeti */
function chatBadge() {
  const b = document.querySelector('.nav-btn[data-id="ses"]'); if (!b) return;
  let x = b.querySelector('.nav-badge');
  if (!CHAT.unread) { if (x) x.remove(); return; }
  if (!x) { x = document.createElement('span'); x.className = 'nav-badge'; b.appendChild(x); }
  x.textContent = CHAT.unread > 99 ? '99+' : CHAT.unread;
}
const _renderNavC = renderNav;
renderNav = function () { _renderNavC(); chatBadge(); };

/* ---------- gönderme ---------- */
function meMsg() {
  const ch = CUR.ch || {};
  return { u: myUid(), n: (CLOUD.user.displayName || 'Oyuncu').slice(0, 40), c: ch.name || '', cls: ch.cls || 'warrior', nat: ch.nation || 'karus', race: ch.race || '', rt: ch.rtype || 'okcu' };
}
async function chatPost(body, id) {
  const at = Date.now();
  const doc = { ...body, at, ts: FB.serverTimestamp() };
  const ref = chatDoc(CHAT.code, id || (at.toString(36) + Math.random().toString(36).slice(2, 8)));
  try { await FB.setDoc(ref, doc); }
  catch (e) {
    // eski kurallar "yanıt" alanını tanımıyorsa yanıtsız gönder
    if (doc.r && isPermErr(e)) { delete doc.r; await FB.setDoc(ref, doc); } else throw e;
  }
}
const botSay = (t, kind = 'cmd', id) => chatPost({ u: myUid(), bot: 1, kind, t: String(t).slice(0, 600) }, id);
/* WhatsApp gibi: kutu hemen temizlenir, mesaj "gönderiliyor" (⏳) olarak hemen listede görünür;
   art arda yazılanlar yazıldığı sırayla gider. */
let chatQueue = Promise.resolve();
function chatSend(text) {
  text = String(text || '').replace(/\s+$/, '').replace(/^\s+/, '');
  if (!text || !CHAT.code) return;
  if (text.length > 500) return toast('Mesaj en fazla 500 karakter olabilir', 'err');
  const body = { ...meMsg(), t: text };
  if (CHAT.reply) body.r = { i: CHAT.reply.id, n: String(CHAT.reply.n || '').slice(0, 40), t: String(CHAT.reply.t || '').slice(0, 80) };
  CHAT.reply = null; CHAT.draft = '';
  const inp = document.querySelector('[data-chat-in]'); if (inp) { inp.value = ''; autoGrow(inp); inp.focus(); }
  chatReplyBar(); chatSuggest();
  const el = document.querySelector('[data-chat-list]'); if (el) el.dataset.stick = '1';
  chatQueue = chatQueue.then(async () => {
    try { await chatPost(body); if (text.startsWith('/')) await botRun(text); }
    catch (e) {
      toast(isPermErr(e) ? 'Gönderilemedi: Firebase kuralları yayınlanmamış' : 'Gönderilemedi: ' + e.message, 'err');
      const i2 = document.querySelector('[data-chat-in]'); if (i2 && !i2.value) { i2.value = text; CHAT.draft = text; autoGrow(i2); }
    }
  });
}

/* ---------- KO Bot komutları ---------- */
const BOT_CMDS = [
  { c: '/zar', a: '[üst sınır]', d: 'Drop için zar at (varsayılan 1–100)' },
  { c: '/gb', a: '', d: 'Sunucundaki güncel 1 GB fiyatı' },
  { c: '/event', a: '', d: 'Sıradaki 3 event ve kalan süre' },
  { c: '/fiyat', a: '<item adı>', d: 'Canlı pazarda en ucuz 3 ilan' },
  { c: '/böl', a: '<tutar> [kişi]', d: 'Noah / GB paylaştır (ör. /böl 2.4b 8)' },
  { c: '/seste', a: '', d: 'Şu an seste kimler var' },
  { c: '/yardım', a: '', d: 'Komut listesi' },
];
const whoName = () => (CUR.ch && CUR.ch.name) || (CLOUD.user && CLOUD.user.displayName) || 'Biri';
const relMin = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`; };
async function botRun(text) {
  const [cmdRaw, ...rest] = text.slice(1).split(/\s+/);
  const cmd = trLow(cmdRaw || ''), arg = rest.join(' ').trim();
  if (cmd === 'yardım' || cmd === 'yardim' || cmd === 'help' || cmd === 'komutlar') {
    return botSay('Komutlar:\n' + BOT_CMDS.map(x => `${x.c}${x.a ? ' ' + x.a : ''} — ${x.d}`).join('\n'));
  }
  if (cmd === 'zar' || cmd === 'roll') {
    const max = Math.min(1e6, Math.max(2, Math.round(parseNum(arg)) || 100));
    const v = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % max);
    return botSay(`🎲 ${whoName()} zar attı: **${v}** (1–${fmtN(max)})`, 'zar');
  }
  if (cmd === 'gb') {
    const st = S.settings, m = S.gbMarket;
    let line = st.gbTL ? `💰 1 GB · ${st.server || ''}: **${fmtTL(st.gbTL)}**` : '💰 GB fiyatı henüz alınmadı (GB Fiyatları sayfasını aç).';
    if (m && typeof gbStats === 'function') {
      const g = gbStats(m, st.server);
      if (g.minSell) line += ` · en ucuz satış ${fmtTL(g.minSell.v)} (${g.minSell.site})`;
      if (g.maxBuy) line += ` · en iyi alış ${fmtTL(g.maxBuy.v)}`;
    }
    return botSay(line, 'gb');
  }
  if (cmd === 'event' || cmd === 'eventler') {
    const now = Date.now();
    const list = (typeof occurrences === 'function' ? occurrences(new Date(), now + 2 * 864e5) : []).filter(o => o.st.getTime() > now).slice(0, 3);
    return botSay(list.length ? '⚔️ Sıradaki eventler:\n' + list.map(o => `${o.e.name} — ${o.t} (${relMin(o.st.getTime() - now)} sonra)`).join('\n') : '⚔️ Yakında event yok (Event Takvimi boş olabilir).', 'event');
  }
  if (cmd === 'fiyat' || cmd === 'pazar') {
    if (!arg) return botSay('🔎 Kullanım: /fiyat <item adı>  (ör. /fiyat avedon)');
    try {
      const l = (await listApi({ query: arg, type: 'sell', priceshort: 'asc' })).filter(x => +x.price > 0).sort((a, b) => a.price - b.price);
      if (!l.length) return botSay(`🔎 "${arg}" için satış ilanı bulunamadı.`, 'fiyat');
      return botSay(`🔎 "${arg}" · ${l.length} ilan, en ucuzlar:\n` + l.slice(0, 3).map(x => `${x.name} — **${fmtShort(+x.price)}** · ${x.server} · ${x.seller || '?'}`).join('\n'), 'fiyat');
    } catch (e) { return botSay('🔎 Pazar şu an okunamadı.', 'fiyat'); }
  }
  if (cmd === 'böl' || cmd === 'bol' || cmd === 'pay') {
    const [a, b] = arg.split(/\s+/);
    const amt = parseAmt(a || '');
    const n = Math.round(parseNum(b || '')) || Object.keys(VOICE.presence).length || (typeof teamMembers === 'function' ? teamMembers().length : 0) || 8;
    if (!amt) return botSay('🪙 Kullanım: /böl <tutar> [kişi]  (ör. /böl 2.4b 8)');
    return botSay(`🪙 ${fmtShort(amt)} ÷ ${n} kişi = **${fmtShort(Math.floor(amt / n))}** kişi başı`, 'bol');
  }
  if (cmd === 'seste' || cmd === 'kimler') {
    const r = voiceRoster(false);
    return botSay(r.length ? `🎧 Seste ${r.length} kişi: ` + r.map(x => x.char || x.name).join(', ') : '🎧 Şu an seste kimse yok.', 'seste');
  }
  return botSay(`Bilinmeyen komut: /${cmdRaw}. Komut listesi için /yardım yaz.`);
}

/* ---------- event hatırlatması (lider açarsa) ---------- */
const evSlug = s => trLow(s).replace(/[^a-z0-9]+/g, '').slice(0, 24);
function botEventTick() {
  if (!CHAT.code || !TEAM.doc || !TEAM.doc.botEvents || typeof occurrences !== 'function') return;
  const now = Date.now();
  occurrences(new Date(), now + 11 * 60000).forEach(o => {
    const dt = o.st.getTime() - now;
    if (dt <= 10 * 60000 && dt > 8 * 60000) {
      const id = `ev_${evSlug(o.e.name)}_${o.st.getTime()}`;
      if (CHAT.msgs.some(m => m.id === id)) return;
      botSay(`⏰ **${o.e.name}** ${Math.round(dt / 60000)} dk sonra başlıyor (${o.t}). Hazırlanın!`, 'hatirlat', id).catch(() => { });
    }
  });
}
setInterval(botEventTick, 30000);
async function toggleBotEvents() {
  if (!TEAM.doc || TEAM.doc.owner !== myUid()) return toast('Bunu yalnızca ekip lideri değiştirebilir', 'err');
  try { await FB.setDoc(teamRef(TEAM.code), { botEvents: !TEAM.doc.botEvents }, { merge: true }); toast(!TEAM.doc.botEvents ? 'Bot event hatırlatmaları açıldı' : 'Bot event hatırlatmaları kapandı', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------- görünüm ---------- */
function fmtMsg(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
const hhmm = at => { const d = new Date(at || 0); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function dayLabel(at) {
  const d = new Date(at), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
const TICK1 = '<svg viewBox="0 0 16 11" width="15" height="11"><path d="M1.5 6l3.2 3.2L14.5 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK2 = '<svg viewBox="0 0 20 11" width="18" height="11"><path d="M1.2 6l3 3L12.6 1M7.5 8.6l.9.6L18.8 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOCK = '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.3 1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const REPLY_IC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/></svg>';
/* benim mesajım için durum: gönderiliyor / gönderildi / kimler okudu */
function msgStatus(m) {
  if (m.pend) return { cls: 'pend', ic: CLOCK, tip: 'Gönderiliyor…' };
  const others = (TEAM.doc && TEAM.doc.memberUids || []).filter(u => u !== myUid());
  const mem = (TEAM.doc && TEAM.doc.members) || {};
  const read = others.filter(u => ((mem[u] || {}).cs || 0) >= m.st);
  const names = read.map(u => { const e = mem[u] || {}; const c = (e.chars || []).find(x => x.id === e.main) || (e.chars || [])[0]; return (c && c.name) || e.name || 'üye'; });
  if (others.length && read.length === others.length) return { cls: 'read', ic: TICK2, tip: 'Herkes okudu' };
  if (read.length) return { cls: 'some', ic: TICK2, tip: 'Okuyanlar: ' + names.join(', ') };
  return { cls: 'sent', ic: TICK1, tip: 'Gönderildi' };
}
function chatListHTML() {
  if (CHAT.err) return `<div class="callout r">${esc(CHAT.err)}</div>`;
  if (!CHAT.loaded) return '<div class="chat-empty mut">Yükleniyor…</div>';
  if (!CHAT.msgs.length) return `<div class="chat-empty"><b>Henüz mesaj yok</b><span class="mut">İlk mesajı sen yaz. Bot komutları için <code>/yardım</code>.</span></div>`;
  let out = '', prev = null, prevDay = '';
  const byId = Object.fromEntries(CHAT.msgs.map(m => [m.id, m]));
  CHAT.msgs.forEach((m, idx) => {
    const day = dayLabel(m.st);
    if (day !== prevDay) { out += `<div class="chat-day"><span>${day}</span></div>`; prevDay = day; prev = null; }
    const next = CHAT.msgs[idx + 1];
    const same = (a, b) => a && b && !a.bot && !b.bot && a.u === b.u && Math.abs(b.st - a.st) < 3 * 60000 && dayLabel(a.st) === dayLabel(b.st);
    const grouped = same(prev, m), last = !same(m, next);
    const mine = m.u === myUid() && !m.bot;
    const c = CLASSES[m.cls] || CLASSES.warrior;
    const canDel = !m.pend && ((m.u === myUid()) || (TEAM.doc && TEAM.doc.owner === myUid()));
    const st = mine ? msgStatus(m) : null;
    const q = m.r && m.r.i ? `<button type="button" class="msg-q" data-act="chat-jump" data-id="${esc(m.r.i)}"><b>${esc(m.r.n || '')}</b><span>${esc((byId[m.r.i] && byId[m.r.i].t) || m.r.t || '')}</span></button>` : '';
    out += `<div class="msg ${m.bot ? 'bot' : ''} ${grouped ? 'cont' : ''} ${last ? 'last' : ''} ${mine ? 'mine' : 'theirs'}" data-mid="${esc(m.id)}">
      ${mine || m.bot ? '' : `<div class="msg-av">${grouped ? '' : charAvatar({ cls: m.cls, nation: m.nat, race: m.race, rtype: m.rt }, 30)}</div>`}
      <div class="msg-bub">
        ${m.bot ? `<div class="msg-h"><span class="bot-av">${BOT_ICON}</span><b>KO Bot</b></div>` : !mine && !grouped ? `<div class="msg-h"><b style="color:${c.color}">${esc(m.c || m.n)}</b>${m.c ? `<span class="msg-n">${esc(m.n)}</span>` : ''}</div>` : ''}
        ${q}
        <div class="msg-t2">${fmtMsg(m.t || '')}<span class="msg-meta"><span class="msg-time">${hhmm(m.st)}</span>${st ? `<span class="msg-st ${st.cls}" title="${esc(st.tip)}">${st.ic}</span>` : ''}</span></div>
      </div>
      <div class="msg-acts">
        ${m.pend ? '' : `<button class="icon-btn" data-act="chat-reply" data-id="${esc(m.id)}" title="Yanıtla" aria-label="Yanıtla">${REPLY_IC}</button>`}
        ${canDel ? `<button class="icon-btn" data-act="chat-del" data-id="${esc(m.id)}" title="Sil" aria-label="Sil">${ICON.del}</button>` : ''}
      </div>
    </div>`;
    prev = m;
  });
  return out;
}
function chatPanel() {
  chatWatch();
  const isOwner = TEAM.doc && TEAM.doc.owner === myUid();
  return `<div class="chat-head"><h3>Ekip sohbeti</h3><span class="mut">${CHAT.msgs.length ? CHAT.msgs.length + ' mesaj' : ''}</span><span class="spacer"></span>
      <button class="chip ${TEAM.doc && TEAM.doc.botEvents ? 'on' : ''}" data-act="bot-events" title="${isOwner ? 'Bot, eventlerden 10 dk önce ekibe hatırlatma yazar' : 'Yalnızca ekip lideri değiştirebilir'}">${BOT_ICON.replace('<svg', '<svg width="14" height="14"')} Event hatırlatma ${TEAM.doc && TEAM.doc.botEvents ? 'açık' : 'kapalı'}</button></div>
    <div class="chat-wrap">
      <div class="chat-list" data-chat-list>${chatListHTML()}</div>
      <button type="button" class="chat-down" data-act="chat-down" data-chat-down hidden aria-label="En alta in"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg><span data-chat-newc></span></button>
    </div>
    <div class="chat-sug" data-chat-sug hidden></div>
    <div class="chat-reply" data-chat-reply hidden></div>
    <form class="chat-form" onsubmit="return false">
      <textarea class="inp" data-chat-in data-fk="chatIn" maxlength="500" rows="1" placeholder="Mesaj yaz… (komutlar için /)" autocomplete="off" enterkeyhint="send">${esc(CHAT.draft)}</textarea>
      <button class="btn pri chat-sendbtn" data-act="chat-send" title="Gönder" aria-label="Gönder"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button>
    </form>`;
}
function autoGrow(t) { if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
function chatReplyBar() {
  const box = document.querySelector('[data-chat-reply]'); if (!box) return;
  const r = CHAT.reply;
  if (!r) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="cr-in"><b>${esc(r.n)}</b><span>${esc(r.t)}</span></div><button type="button" class="icon-btn" data-act="chat-reply-x" aria-label="Yanıtı kaldır">✕</button>`;
}
/* yalnızca liste kısmını güncelle; en alttaysa (ya da yeni mesaj gönderdiysem) en alta kaydır */
function chatPaint() {
  if (ui.page === 'ekip') { const t = document.querySelector('.vc-slot'); if (t && typeof voiceTeaser === 'function') t.innerHTML = voiceTeaser(); }
  const el = document.querySelector('[data-chat-list]'); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80 || !el.dataset.init || el.dataset.stick === '1';
  const prevCount = +el.dataset.count || 0;
  el.innerHTML = chatListHTML();
  el.dataset.count = CHAT.msgs.length;
  const head = document.querySelector('.chat-head .mut'); if (head) head.textContent = CHAT.msgs.length ? CHAT.msgs.length + ' mesaj' : '';
  if (atBottom) { el.scrollTop = el.scrollHeight; el.dataset.init = '1'; el.dataset.stick = ''; CHAT.newBelow = 0; }
  else if (CHAT.msgs.length > prevCount) CHAT.newBelow += CHAT.msgs.length - prevCount;
  chatDownBtn();
}
function chatDownBtn() {
  const el = document.querySelector('[data-chat-list]'), b = document.querySelector('[data-chat-down]'); if (!el || !b) return;
  const far = el.scrollHeight - el.scrollTop - el.clientHeight > 160;
  if (!far) CHAT.newBelow = 0;
  b.hidden = !far;
  const n = b.querySelector('[data-chat-newc]'); if (n) n.textContent = CHAT.newBelow ? CHAT.newBelow : '';
}
document.addEventListener('scroll', e => { if (e.target && e.target.dataset && e.target.dataset.chatList != null) chatDownBtn(); }, true);
/* telefonda mesaja uzun basınca Yanıtla / Sil düğmeleri çıkar; başka yere dokununca kaybolur */
document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('.msg.sel')) document.querySelectorAll('.msg.sel').forEach(x => x.classList.remove('sel')); }, true);
let lpTimer = null;
document.addEventListener('touchstart', e => {
  const m = e.target.closest && e.target.closest('.msg[data-mid]'); if (!m || e.target.closest('a,button')) return;
  lpTimer = setTimeout(() => { lpTimer = null; if (navigator.vibrate) navigator.vibrate(15); document.querySelectorAll('.msg.sel').forEach(x => x !== m && x.classList.remove('sel')); m.classList.toggle('sel'); }, 450);
}, { passive: true });
['touchend', 'touchmove', 'touchcancel'].forEach(t => document.addEventListener(t, () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true }));
function chatSuggest() {
  const box = document.querySelector('[data-chat-sug]'), inp = document.querySelector('[data-chat-in]');
  if (!box || !inp) return;
  const v = inp.value;
  if (!v.startsWith('/') || v.includes(' ')) { box.hidden = true; return; }
  const q = trLow(v);
  const list = BOT_CMDS.filter(x => x.c.startsWith(q));
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = list.map(x => `<button type="button" data-act="chat-cmd" data-c="${x.c}"><b>${x.c}</b> <span class="mut">${esc(x.a)}</span><span>${esc(x.d)}</span></button>`).join('');
}
Object.assign(ACTIONS, {
  'chat-send': () => { const inp = document.querySelector('[data-chat-in]'); if (inp) chatSend(inp.value); },
  'chat-reply': el => {
    const m = CHAT.msgs.find(x => x.id === el.dataset.id); if (!m) return;
    CHAT.reply = { id: m.id, n: m.bot ? 'KO Bot' : (m.c || m.n || ''), t: String(m.t || '').replace(/\*\*/g, '').slice(0, 80) };
    chatReplyBar(); const inp = document.querySelector('[data-chat-in]'); if (inp) inp.focus();
  },
  'chat-reply-x': () => { CHAT.reply = null; chatReplyBar(); },
  'chat-jump': el => {
    const t = document.querySelector(`.msg[data-mid="${CSS.escape(el.dataset.id)}"]`);
    if (!t) return toast('Bu mesaj artık listede değil');
    t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
  },
  'chat-down': () => { const el = document.querySelector('[data-chat-list]'); if (el) { el.scrollTop = el.scrollHeight; CHAT.newBelow = 0; chatDownBtn(); } },
  'chat-cmd': el => { const inp = document.querySelector('[data-chat-in]'); if (!inp) return; inp.value = el.dataset.c + ' '; CHAT.draft = inp.value; inp.focus(); chatSuggest(); },
  'chat-del': el => { FB.deleteDoc(chatDoc(CHAT.code, el.dataset.id)).catch(e => toast('Silinemedi: ' + e.message, 'err')); },
  'bot-events': () => toggleBotEvents(),
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.chatIn != null) { CHAT.draft = e.target.value; autoGrow(e.target); chatSuggest(); } });
document.addEventListener('keydown', e => {
  if (!e.target.dataset || e.target.dataset.chatIn == null) return;
  // bilgisayarda Enter gönderir (Shift+Enter yeni satır); telefonda Enter yeni satır, gönder düğmesiyle gider
  const touch = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) { e.preventDefault(); chatSend(e.target.value); }
  if (e.key === 'Escape' && CHAT.reply) { CHAT.reply = null; chatReplyBar(); }
  if (e.key === 'Tab') { const first = document.querySelector('[data-chat-sug]:not([hidden]) button'); if (first) { e.preventDefault(); first.click(); } }
});
/* sayfa açılınca okundu say, listeyi en alta kaydır */
const _renderC = render;
render = function () {
  _renderC();
  if (ui.page === 'ses') {
    chatMarkSeen();
    const el = document.querySelector('[data-chat-list]'); if (el) { el.scrollTop = el.scrollHeight; el.dataset.init = '1'; el.dataset.count = CHAT.msgs.length; }
    autoGrow(document.querySelector('[data-chat-in]')); chatReplyBar();
  }
  chatBadge();
};
const _logoutC = logout;
logout = async function () { if (CHAT.unsub) { CHAT.unsub(); CHAT.unsub = null; } CHAT.code = ''; CHAT.msgs = []; return _logoutC(); };
