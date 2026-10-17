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
const CHAT = { code: '', unsub: null, msgs: [], unread: 0, seen: 0, err: '', loaded: false, sending: false, draft: '' };
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
  CHAT.unsub = FB.onSnapshot(FB.query(chatCol(code), FB.orderBy('at'), FB.limitToLast(120)), snap => {
    const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    const had = new Set(CHAT.msgs.map(m => m.id)), fresh = CHAT.loaded ? list.filter(m => !had.has(m.id)) : [];
    CHAT.msgs = list; CHAT.loaded = true;
    const viewing = ui.page === 'ses' && !document.hidden;
    if (viewing) chatMarkSeen();
    else CHAT.unread = list.filter(m => (m.at || 0) > CHAT.seen && m.u !== myUid()).length;
    if (fresh.some(m => m.u !== myUid() || m.bot) && !viewing) chatPing();
    chatPaint(); chatBadge();
  }, e => { CHAT.err = isPermErr(e) ? 'Yazışma için Firebase kuralları yayınlanmamış.' : e.message; if (isPermErr(e)) TEAM.rulesMissing = true; CHAT.loaded = true; chatPaint(); });
}
setInterval(chatWatch, 3000);
function chatMarkSeen() {
  const last = CHAT.msgs.length ? CHAT.msgs[CHAT.msgs.length - 1].at || 0 : 0;
  if (last > CHAT.seen) { CHAT.seen = last; try { localStorage.setItem(seenKey(CHAT.code), String(last)); } catch { } }
  if (CHAT.unread) { CHAT.unread = 0; chatBadge(); }
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
  await FB.setDoc(chatDoc(CHAT.code, id || (at.toString(36) + Math.random().toString(36).slice(2, 8))), doc);
}
const botSay = (t, kind = 'cmd', id) => chatPost({ u: myUid(), bot: 1, kind, t: String(t).slice(0, 600) }, id);
async function chatSend(text) {
  text = String(text || '').trim();
  if (!text || !CHAT.code || CHAT.sending) return;
  if (text.length > 500) return toast('Mesaj en fazla 500 karakter olabilir', 'err');
  CHAT.sending = true;
  try {
    await chatPost({ ...meMsg(), t: text });
    CHAT.draft = '';
    const inp = document.querySelector('[data-chat-in]'); if (inp) { inp.value = ''; inp.focus(); }
    if (text.startsWith('/')) await botRun(text);
  } catch (e) { toast(isPermErr(e) ? 'Gönderilemedi: Firebase kuralları yayınlanmamış' : 'Gönderilemedi: ' + e.message, 'err'); }
  finally { CHAT.sending = false; chatSuggest(); }
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
function chatListHTML() {
  if (CHAT.err) return `<div class="callout r">${esc(CHAT.err)}</div>`;
  if (!CHAT.loaded) return '<div class="chat-empty mut">Yükleniyor…</div>';
  if (!CHAT.msgs.length) return `<div class="chat-empty"><b>Henüz mesaj yok</b><span class="mut">İlk mesajı sen yaz. Bot komutları için <code>/yardım</code>.</span></div>`;
  let out = '', prev = null, prevDay = '';
  CHAT.msgs.forEach(m => {
    const day = dayLabel(m.at);
    if (day !== prevDay) { out += `<div class="chat-day"><span>${day}</span></div>`; prevDay = day; prev = null; }
    const grouped = prev && !m.bot && !prev.bot && prev.u === m.u && (m.at - prev.at) < 4 * 60000;
    const mine = m.u === myUid() && !m.bot;
    const c = CLASSES[m.cls] || CLASSES.warrior;
    const canDel = (m.u === myUid()) || (TEAM.doc && TEAM.doc.owner === myUid());
    out += `<div class="msg ${m.bot ? 'bot' : ''} ${grouped ? 'cont' : ''} ${mine ? 'mine' : ''}">
      <div class="msg-av">${grouped ? '' : m.bot ? `<span class="bot-av">${BOT_ICON}</span>` : charAvatar({ cls: m.cls, nation: m.nat, race: m.race, rtype: m.rt }, 34)}</div>
      <div class="msg-body">
        ${grouped ? '' : `<div class="msg-h"><b style="${m.bot ? '' : `color:${c.color}`}">${m.bot ? 'KO Bot' : esc(m.c || m.n)}</b>${m.bot ? '<span class="badge b">bot</span>' : m.c ? `<span class="msg-n">${esc(m.n)}</span>` : ''}<span class="msg-t">${hhmm(m.at)}</span></div>`}
        <div class="msg-t2">${fmtMsg(m.t || '')}</div>
      </div>
      ${canDel ? `<button class="icon-btn msg-del" data-act="chat-del" data-id="${esc(m.id)}" title="Sil">${ICON.del}</button>` : ''}
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
    <div class="chat-list" data-chat-list>${chatListHTML()}</div>
    <div class="chat-sug" data-chat-sug hidden></div>
    <form class="chat-form" onsubmit="return false">
      <input class="inp" data-chat-in data-fk="chatIn" maxlength="500" placeholder="Mesaj yaz… (komutlar için /)" value="${esc(CHAT.draft)}" autocomplete="off" enterkeyhint="send">
      <button class="btn pri" data-act="chat-send" title="Gönder" aria-label="Gönder"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button>
    </form>`;
}
/* yalnızca liste kısmını güncelle; en alttaysa en alta kaydır */
function chatPaint() {
  if (ui.page === 'ekip') { const t = document.querySelector('.vc-slot'); if (t && typeof voiceTeaser === 'function') t.innerHTML = voiceTeaser(); }
  const el = document.querySelector('[data-chat-list]'); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80 || !el.dataset.init;
  el.innerHTML = chatListHTML();
  const head = document.querySelector('.chat-head .mut'); if (head) head.textContent = CHAT.msgs.length ? CHAT.msgs.length + ' mesaj' : '';
  if (atBottom) { el.scrollTop = el.scrollHeight; el.dataset.init = '1'; }
}
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
  'chat-cmd': el => { const inp = document.querySelector('[data-chat-in]'); if (!inp) return; inp.value = el.dataset.c + ' '; CHAT.draft = inp.value; inp.focus(); chatSuggest(); },
  'chat-del': el => { FB.deleteDoc(chatDoc(CHAT.code, el.dataset.id)).catch(e => toast('Silinemedi: ' + e.message, 'err')); },
  'bot-events': () => toggleBotEvents(),
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.chatIn != null) { CHAT.draft = e.target.value; chatSuggest(); } });
document.addEventListener('keydown', e => {
  if (!e.target.dataset || e.target.dataset.chatIn == null) return;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatSend(e.target.value); }
  if (e.key === 'Tab') { const first = document.querySelector('[data-chat-sug]:not([hidden]) button'); if (first) { e.preventDefault(); first.click(); } }
});
/* sayfa açılınca okundu say, listeyi en alta kaydır */
const _renderC = render;
render = function () {
  _renderC();
  if (ui.page === 'ses') {
    chatMarkSeen();
    const el = document.querySelector('[data-chat-list]'); if (el) { el.scrollTop = el.scrollHeight; el.dataset.init = '1'; }
  }
  chatBadge();
};
const _logoutC = logout;
logout = async function () { if (CHAT.unsub) { CHAT.unsub(); CHAT.unsub = null; } CHAT.code = ''; CHAT.msgs = []; return _logoutC(); };
