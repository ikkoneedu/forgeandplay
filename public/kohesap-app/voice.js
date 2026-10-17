'use strict';
/* ==========================================================================
   EKİP SESLİ SOHBET
   - Ses, üyeler arasında doğrudan (WebRTC, eşler arası) gider; sunucuya kaydedilmez.
   - Eşleştirme (signaling) Firestore üzerinden:
       kohesapTeams/{kod}/voice/{uid}            → odadaki kişi (ad, karakter, mikrofon durumu, nabız)
       kohesapTeams/{kod}/voice/{uid}/inbox/{id} → o kişiye gelen bağlantı mesajları (offer/answer/ice)
   - Her ikili için uid'i küçük olan taraf bağlantıyı başlatır (çakışma olmaz).
   - Modlar: açık mikrofon, ses algılama (eşik ayarlı), bas-konuş (uygulama içinde
     tuş/fare; Windows uygulamasında oyun öndeyken de çalışır).
   ========================================================================== */
const VOICE_STALE = 90e3;     // bu kadar süre nabız gelmeyen kişi odadan düşmüş sayılır
const VOICE_HB = 20e3;
const PTT_KEYS = [
  { id: 'Mouse4', vk: 0x05, label: 'Fare yan tuş 1 (geri)' },
  { id: 'Mouse5', vk: 0x06, label: 'Fare yan tuş 2 (ileri)' },
  { id: 'CapsLock', vk: 0x14, label: 'Caps Lock', code: 'CapsLock' },
  { id: 'Backquote', vk: 0xC0, label: '" (Esc altı)', code: 'Backquote' },
  { id: 'KeyV', vk: 0x56, label: 'V', code: 'KeyV' },
  { id: 'KeyB', vk: 0x42, label: 'B', code: 'KeyB' },
  { id: 'AltLeft', vk: 0xA4, label: 'Sol Alt', code: 'AltLeft' },
  { id: 'ControlLeft', vk: 0xA2, label: 'Sol Ctrl', code: 'ControlLeft' },
];
const VPREF_KEY = 'kohesap-voice';
const vprefLoad = () => { try { return JSON.parse(localStorage.getItem(VPREF_KEY) || '{}'); } catch { return {}; } };
const VOICE = {
  on: false, joining: false, err: '', code: '', sid: '',
  stream: null, sendTrack: null, ctx: null, localAn: null,
  peers: new Map(), presence: {}, unsubs: [], hbTimer: null, levelTimer: null,
  muted: false, deaf: false, pttDown: false, gateOpen: false, gateUntil: 0, level: 0, speaking: false,
  ptt: null, devices: { in: [], out: [] },
  pref: Object.assign({ mode: 'vad', thr: 12, key: 'Mouse4', mic: '', spk: '', vol: {}, sounds: true }, vprefLoad()),
};
const vprefSave = () => { try { localStorage.setItem(VPREF_KEY, JSON.stringify(VOICE.pref)); } catch { } };
const voiceCol = () => FB.collection(CLOUD.db, 'kohesapTeams', VOICE.code, 'voice');
const voiceDoc = u => FB.doc(CLOUD.db, 'kohesapTeams', VOICE.code, 'voice', u);
const inboxCol = u => FB.collection(CLOUD.db, 'kohesapTeams', VOICE.code, 'voice', u, 'inbox');
const inboxDoc = (u, id) => FB.doc(CLOUD.db, 'kohesapTeams', VOICE.code, 'voice', u, 'inbox', id);
const rnd = () => Math.random().toString(36).slice(2, 10);
function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  // Yönetim panelinden TURN sunucusu girilebilir (bazı ev/mobil ağlarda doğrudan bağlantı kurulamaz)
  try { const t = JSON.parse(S.settings.voiceTurn || 'null'); if (t) (Array.isArray(t) ? t : [t]).forEach(x => x && x.urls && list.push(x)); } catch { }
  return list;
}

/* ---------- küçük sesler ---------- */
function blip(up) {
  if (!VOICE.pref.sounds) return;
  try {
    const c = VOICE.ctx || (VOICE.ctx = new AudioContext());
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(up ? 660 : 520, t); o.frequency.linearRampToValueAtTime(up ? 880 : 380, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.2);
  } catch { }
}

/* ---------- ses seviyesi ölçümü ---------- */
function analyser(stream) {
  const c = VOICE.ctx || (VOICE.ctx = new AudioContext());
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser();
  an.fftSize = 512; src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  return { an, src, read() { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.min(100, Math.sqrt(s / buf.length) * 300); } };
}
function setSending(open) {
  if (!VOICE.sendTrack) return;
  const want = !!open && !VOICE.muted;
  if (VOICE.sendTrack.enabled !== want) VOICE.sendTrack.enabled = want;
}
function voiceTick() {
  if (!VOICE.on) return;
  if (!TEAM.doc || TEAM.code !== VOICE.code) { voiceLeave(true); toast('Ekipten ayrıldığın için sesli sohbet kapandı'); return; }
  const now = Date.now(), p = VOICE.pref;
  VOICE.level = VOICE.localAn ? VOICE.localAn.read() : 0;
  let open;
  if (p.mode === 'open') open = true;
  else if (p.mode === 'ptt') open = VOICE.pttDown;
  else { if (VOICE.level >= p.thr) VOICE.gateUntil = now + 450; open = now < VOICE.gateUntil; }
  VOICE.gateOpen = open;
  setSending(open);
  const sp = open && !VOICE.muted && VOICE.level >= Math.min(p.thr, 8);
  let changed = sp !== VOICE.speaking; VOICE.speaking = sp;
  VOICE.peers.forEach(pe => {
    const lv = pe.an ? pe.an.read() : 0, s = lv > 6 && !VOICE.deaf;
    if (s !== pe.speaking) { pe.speaking = s; changed = true; }
  });
  const meter = document.querySelector('[data-vmeter]');
  if (meter) { meter.style.width = VOICE.level + '%'; meter.classList.toggle('hot', VOICE.level >= p.thr); }
  if (changed) voicePaintLive();
}

/* ---------- eşler ---------- */
function peerFor(uidv, sid) {
  let pe = VOICE.peers.get(uidv);
  if (pe && pe.sid !== sid) { closePeer(uidv); pe = null; }
  if (pe) return pe;
  const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
  pe = { uid: uidv, sid, pc, audio: null, an: null, speaking: false, state: 'bağlanıyor', pendingIce: [], offerer: myUid() < uidv };
  VOICE.peers.set(uidv, pe);
  pc.addTrack(VOICE.sendTrack, VOICE.stream);
  // adaylar önce teklifin içinde gider; teklif gönderildikten sonra bulunanlar ayrıca yollanır
  pc.onicecandidate = e => { if (e.candidate && pe.descSent) voiceSend(uidv, { t: 'ice', c: e.candidate.toJSON() }); };
  pc.ontrack = e => {
    const st = e.streams[0] || new MediaStream([e.track]);
    const a = new Audio(); a.autoplay = true; a.playsInline = true; a.srcObject = st;
    a.volume = Math.min(1, (VOICE.pref.vol[uidv] ?? 100) / 100); a.muted = VOICE.deaf;
    if (VOICE.pref.spk && a.setSinkId) a.setSinkId(VOICE.pref.spk).catch(() => { });
    a.play().catch(() => { pe.needsTap = true; voicePaintLive(); });
    pe.audio = a;
    try { pe.an = analyser(st); } catch { }
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    pe.state = s === 'connected' ? 'bağlı' : s === 'failed' ? 'kurulamadı' : s === 'disconnected' ? 'koptu' : 'bağlanıyor';
    if (s === 'connected') { blip(true); pe.okAt = Date.now(); }
    if (s === 'disconnected') pe.lostAt = Date.now();
    if (s === 'failed' && pe.offerer) restartPeer(uidv);
    voicePaintLive();
  };
  return pe;
}
function waitGather(pc, ms = 2500) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
const tuneSdp = sdp => sdp.replace(/(a=fmtp:\d+ [^\r\n]*?)(minptime=\d+;useinbandfec=1)/, '$1$2;usedtx=1;maxaveragebitrate=40000');
async function makeOffer(uidv, restart) {
  const pe = VOICE.peers.get(uidv); if (!pe) return;
  const pc = pe.pc;
  if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' }).catch(() => { });
  pe.offerAt = Date.now(); pe.descSent = false;
  const off = await pc.createOffer(restart ? { iceRestart: true } : {});
  off.sdp = tuneSdp(off.sdp);
  await pc.setLocalDescription(off);
  await waitGather(pc);
  if (VOICE.peers.get(uidv) !== pe) return;
  voiceSend(uidv, { t: 'offer', sdp: pc.localDescription.sdp });
  pe.descSent = true;
}
function restartPeer(uidv) { const pe = VOICE.peers.get(uidv); if (pe && pe.offerer) makeOffer(uidv, true).catch(() => { }); }
function closePeer(uidv) {
  const pe = VOICE.peers.get(uidv); if (!pe) return;
  try { pe.pc.close(); } catch { }
  if (pe.audio) { pe.audio.srcObject = null; }
  try { pe.an && pe.an.src.disconnect(); } catch { }
  VOICE.peers.delete(uidv);
}
async function voiceSend(to, msg) {
  const p = VOICE.presence[to]; if (!p) return;
  try { await FB.setDoc(inboxDoc(to, rnd() + rnd()), { ...msg, from: myUid(), fs: VOICE.sid, ts: p.sid, at: Date.now() }); }
  catch (e) { console.warn('ses mesajı gönderilemedi', e); }
}
async function onInbox(d) {
  const m = d.data(); FB.deleteDoc(inboxDoc(myUid(), d.id)).catch(() => { });
  if (!m || m.ts !== VOICE.sid || !VOICE.on) return;          // eski oturuma ait
  const pr = VOICE.presence[m.from]; if (!pr || pr.sid !== m.fs) return;
  const pe = peerFor(m.from, m.fs), pc = pe.pc;
  try {
    if (m.t === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      const ans = await pc.createAnswer(); ans.sdp = tuneSdp(ans.sdp);
      pe.descSent = false;
      await pc.setLocalDescription(ans);
      await waitGather(pc);
      voiceSend(m.from, { t: 'answer', sdp: pc.localDescription.sdp });
      pe.descSent = true;
      pe.pendingIce.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => { }));
    } else if (m.t === 'answer') {
      if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      pe.pendingIce.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => { }));
    } else if (m.t === 'ice') {
      if (pc.remoteDescription) await pc.addIceCandidate(m.c).catch(() => { });
      else pe.pendingIce.push(m.c);
    }
  } catch (e) { console.warn('ses bağlantı mesajı', m.t, e); }
}
function onPresence(snap) {
  const now = Date.now(), seen = {};
  snap.forEach(d => { const v = d.data(); if (v && now - (v.hb || 0) < VOICE_STALE) seen[d.id] = v; });
  const before = new Set(Object.keys(VOICE.presence));
  VOICE.presence = seen;
  const me = myUid();
  Object.entries(seen).forEach(([u, v]) => {
    if (u === me) return;
    const pe = VOICE.peers.get(u);
    if (!pe || pe.sid !== v.sid) {
      peerFor(u, v.sid);
      if (me < u) makeOffer(u).catch(e => console.warn('teklif', e));
      if (before.size && !before.has(u)) blip(true);
    }
  });
  [...VOICE.peers.keys()].forEach(u => { if (!seen[u]) { closePeer(u); blip(false); } });
  if (VOICE.on && !seen[me]) beat();                            // kendi kaydımız silindiyse geri yaz
  voicePaint();
}

/* ---------- katıl / ayrıl ---------- */
async function getMic() {
  const p = VOICE.pref;
  const c = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  if (p.mic) c.deviceId = { exact: p.mic };
  try { return await navigator.mediaDevices.getUserMedia({ audio: c }); }
  catch (e) { if (p.mic && e.name === 'OverconstrainedError') { p.mic = ''; vprefSave(); return getMic(); } throw e; }
}
function micError(e) {
  if (!navigator.mediaDevices) return 'Bu tarayıcı mikrofon erişimini desteklemiyor (güvenli bağlantı gerekir).';
  if (e.name === 'NotAllowedError') return 'Mikrofon izni verilmedi. Adres çubuğundaki kilit / mikrofon simgesinden izin ver ve tekrar dene.';
  if (e.name === 'NotFoundError') return 'Mikrofon bulunamadı. Bir mikrofon ya da kulaklık bağla.';
  if (e.name === 'NotReadableError') return 'Mikrofon başka bir program tarafından kullanılıyor olabilir.';
  return 'Mikrofon açılamadı: ' + (e.message || e.name);
}
function myVoiceInfo() {
  const ch = CUR.ch || {};
  return { name: (CLOUD.user.displayName || '').slice(0, 40) || 'Oyuncu', char: ch.name || '', cls: ch.cls || 'warrior', nation: ch.nation || 'karus', level: +ch.level || 0, muted: VOICE.muted, deaf: VOICE.deaf, sid: VOICE.sid, hb: Date.now() };
}
/* kurulamayan / kopan bağlantıyı kendiliğinden yeniden dene (kaybolan mesajlara karşı) */
function voiceWatch() {
  if (!VOICE.on) return;
  const now = Date.now();
  VOICE.peers.forEach((pe, u) => {
    if (!pe.offerer) return;
    const s = pe.pc.connectionState;
    if (s === 'connected') return;
    const stuck = (s === 'new' || s === 'connecting' || s === 'failed') && now - (pe.offerAt || 0) > 7000;
    const lost = s === 'disconnected' && now - (pe.lostAt || now) > 6000 && now - (pe.offerAt || 0) > 6000;
    if (stuck || lost) makeOffer(u, true).catch(() => { });
  });
}
async function beat() { if (VOICE.on) try { await FB.setDoc(voiceDoc(myUid()), myVoiceInfo()); } catch (e) { console.warn('ses nabız', e); } }
async function voiceJoin() {
  if (VOICE.on || VOICE.joining || !TEAM.doc) return;
  VOICE.joining = true; VOICE.err = ''; voicePaint();
  try {
    VOICE.stream = await getMic();
    VOICE.sendTrack = VOICE.stream.getAudioTracks()[0];
    VOICE.ctx = VOICE.ctx || new AudioContext();
    if (VOICE.ctx.state === 'suspended') await VOICE.ctx.resume().catch(() => { });
    VOICE.localAn = analyser(new MediaStream([VOICE.sendTrack.clone()]));
    VOICE.code = TEAM.code; VOICE.sid = rnd(); VOICE.on = true; VOICE.muted = false;
    setSending(VOICE.pref.mode === 'open');
    await beat();
    VOICE.unsubs.push(FB.onSnapshot(inboxCol(myUid()), s => s.docChanges().forEach(c => { if (c.type === 'added') onInbox(c.doc); })));
    VOICE.unsubs.push(FB.onSnapshot(voiceCol(), onPresence));
    VOICE.hbTimer = setInterval(beat, VOICE_HB);
    VOICE.levelTimer = setInterval(voiceTick, 60);
    VOICE.watchTimer = setInterval(voiceWatch, 3000);
    pttStart();
    listDevices();
    blip(true);
    toast('Sesli sohbete katıldın', 'ok');
  } catch (e) {
    VOICE.err = isPermErr(e) ? 'Sese katılınamadı: Firebase kuralları yayınlanmamış (Ekip sayfasındaki adımlara bak).' : e && e.name && e.name !== 'FirebaseError' ? micError(e) : 'Katılınamadı: ' + (e.message || e);
    if (isPermErr(e)) { TEAM.rulesMissing = true; }
    await voiceLeave(true);
  } finally { VOICE.joining = false; voicePaint(); }
}
async function voiceLeave(silent) {
  const was = VOICE.on;
  VOICE.on = false;
  VOICE.unsubs.splice(0).forEach(f => { try { f(); } catch { } });
  clearInterval(VOICE.hbTimer); clearInterval(VOICE.levelTimer); clearInterval(VOICE.watchTimer);
  pttStop();
  [...VOICE.peers.keys()].forEach(closePeer);
  if (VOICE.stream) VOICE.stream.getTracks().forEach(t => t.stop());
  try { VOICE.localAn && VOICE.localAn.src.mediaStream.getTracks().forEach(t => t.stop()); } catch { }
  VOICE.stream = null; VOICE.sendTrack = null; VOICE.localAn = null; VOICE.presence = {}; VOICE.speaking = false;
  if (was && VOICE.code && CLOUD.db && myUid()) FB.deleteDoc(voiceDoc(myUid())).catch(() => { });
  if (was && !silent) { blip(false); toast('Sesli sohbetten ayrıldın'); }
  voicePaint();
}
window.addEventListener('pagehide', () => { if (VOICE.on && VOICE.code && myUid()) FB.deleteDoc(voiceDoc(myUid())).catch(() => { }); });

/* ---------- kontroller ---------- */
function voiceMute(v) { VOICE.muted = v ?? !VOICE.muted; setSending(VOICE.gateOpen); beat(); voicePaint(); }
function voiceDeaf(v) {
  const was = VOICE.deaf;
  VOICE.deaf = v ?? !VOICE.deaf;
  VOICE.peers.forEach(pe => { if (pe.audio) pe.audio.muted = VOICE.deaf; });
  // kulaklık kapanınca mikrofon da kapanır; açılınca önceki haline döner
  if (VOICE.deaf && !was) { VOICE.muteBeforeDeaf = VOICE.muted; VOICE.muted = true; }
  if (!VOICE.deaf && was) VOICE.muted = !!VOICE.muteBeforeDeaf;
  setSending(VOICE.gateOpen); beat(); voicePaint();
}
async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    VOICE.devices.in = all.filter(d => d.kind === 'audioinput');
    VOICE.devices.out = all.filter(d => d.kind === 'audiooutput');
  } catch { }
  voicePaint();
}
async function switchMic(id) {
  VOICE.pref.mic = id; vprefSave();
  if (!VOICE.on) return;
  try {
    const ns = await getMic(), nt = ns.getAudioTracks()[0];
    nt.enabled = VOICE.sendTrack.enabled;
    VOICE.peers.forEach(pe => pe.pc.getSenders().forEach(s => { if (s.track && s.track.kind === 'audio') s.replaceTrack(nt); }));
    VOICE.stream.getTracks().forEach(t => t.stop());
    VOICE.stream = ns; VOICE.sendTrack = nt;
    VOICE.localAn = analyser(new MediaStream([nt.clone()]));
    toast('Mikrofon değiştirildi', 'ok');
  } catch (e) { toast(micError(e), 'err'); }
}
function switchSpeaker(id) {
  VOICE.pref.spk = id; vprefSave();
  VOICE.peers.forEach(pe => { if (pe.audio && pe.audio.setSinkId) pe.audio.setSinkId(id).catch(() => { }); });
}

/* ---------- bas-konuş ---------- */
const pttKey = () => PTT_KEYS.find(k => k.id === VOICE.pref.key) || PTT_KEYS[0];
function setPtt(down) { if (VOICE.pttDown === down) return; VOICE.pttDown = down; voiceTick(); }
function pttStart() {
  pttStop();
  if (VOICE.pref.mode !== 'ptt' || !VOICE.on) return;
  // Windows uygulaması: oyun öndeyken de tuşu algılar
  if (serverMode && window.EventSource) {
    const es = new EventSource('/api/ptt?vk=' + pttKey().vk);
    es.addEventListener('down', () => setPtt(true));
    es.addEventListener('up', () => setPtt(false));
    es.addEventListener('ready', () => { VOICE.pttGlobal = true; voicePaint(); });
    es.addEventListener('unsupported', () => { VOICE.pttGlobal = false; es.close(); });
    VOICE.ptt = es;
  }
}
function pttStop() { if (VOICE.ptt) { VOICE.ptt.close(); VOICE.ptt = null; } VOICE.pttGlobal = false; VOICE.pttDown = false; }
const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
document.addEventListener('keydown', e => { if (VOICE.on && VOICE.pref.mode === 'ptt' && !VOICE.pttGlobal && e.code === pttKey().code && !typing(e.target)) { setPtt(true); if (e.code === 'AltLeft') e.preventDefault(); } });
document.addEventListener('keyup', e => { if (VOICE.on && VOICE.pref.mode === 'ptt' && !VOICE.pttGlobal && e.code === pttKey().code) setPtt(false); });
document.addEventListener('mousedown', e => { if (VOICE.on && VOICE.pref.mode === 'ptt' && !VOICE.pttGlobal && ((e.button === 3 && pttKey().id === 'Mouse4') || (e.button === 4 && pttKey().id === 'Mouse5'))) { e.preventDefault(); setPtt(true); } });
document.addEventListener('mouseup', e => { if (VOICE.on && VOICE.pref.mode === 'ptt' && !VOICE.pttGlobal && (e.button === 3 || e.button === 4)) setPtt(false); });
window.addEventListener('blur', () => { if (!VOICE.pttGlobal) setPtt(false); });

/* ---------- görünüm ---------- */
const MIC_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const MIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/></svg>';
const HEAD_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>';
const HEAD_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 12.7-6.5M20 12v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M3 3l18 18"/></svg>';
const PHONE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14.5c4.7-4.7 12.3-4.7 17 0l-2 2.5-3.5-1.4v-2.2a9 9 0 0 0-6 0v2.2L5.5 17z"/></svg>';
function voiceRoster() {
  const me = myUid(), list = [];
  Object.entries(VOICE.presence).forEach(([u, v]) => {
    const pe = VOICE.peers.get(u);
    list.push({ uid: u, ...v, me: u === me, speaking: u === me ? VOICE.speaking : !!(pe && pe.speaking), state: u === me ? 'sen' : pe ? pe.state : 'bağlanıyor', needsTap: pe && pe.needsTap });
  });
  return list.sort((a, b) => (b.me - a.me) || String(a.char || a.name).localeCompare(String(b.char || b.name), 'tr'));
}
function voicePanel() {
  if (!TEAM.doc) return '';
  const p = VOICE.pref, roster = voiceRoster(), count = roster.length;
  const others = Object.keys(VOICE.presence).length;
  if (!VOICE.on) {
    const inRoom = []; // odadakileri katılmadan da göster (son bilinen)
    return `<div class="card vc vc-off">
      <div class="vc-head"><div class="vc-ico">${HEAD_ON}</div><div><h3>Ekip sesli sohbeti</h3><span class="mut">Ses doğrudan ekip üyeleri arasında gider, hiçbir yere kaydedilmez. En fazla ${TEAM_MAX} kişi.</span></div>
        <span class="spacer"></span><button class="btn pri" data-act="v-join" ${VOICE.joining ? 'disabled' : ''}>${VOICE.joining ? 'Bağlanıyor…' : `${MIC_ON} Sese katıl`}</button></div>
      ${VOICE.err ? `<div class="callout r" style="margin-top:12px">${esc(VOICE.err)}</div>` : ''}
      <div class="hint" style="margin-top:10px">İpucu: oyun sırasında kulaklık kullan. Windows uygulamasında bas-konuş tuşu oyun öndeyken de çalışır.</div>
    </div>`;
  }
  const modeSeg = [['vad', 'Ses algılama'], ['ptt', 'Bas-konuş'], ['open', 'Açık mikrofon']].map(([k, l]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="v-mode" data-v="${k}">${l}</button>`).join('');
  return `<div class="card vc">
    <div class="vc-head"><div class="vc-ico live">${HEAD_ON}</div><div><h3>Ekip sesli sohbeti <span class="badge g">canlı</span></h3><span class="mut">${count} kişi odada</span></div>
      <span class="spacer"></span>
      <div class="vc-ctrl">
        <button class="vbtn ${VOICE.muted ? 'off' : ''}" data-act="v-mute" title="${VOICE.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}">${VOICE.muted ? MIC_OFF : MIC_ON}</button>
        <button class="vbtn ${VOICE.deaf ? 'off' : ''}" data-act="v-deaf" title="${VOICE.deaf ? 'Sesi aç' : 'Herkesi sustur'}">${VOICE.deaf ? HEAD_OFF : HEAD_ON}</button>
        <button class="vbtn leave" data-act="v-leave" title="Ayrıl">${PHONE_OFF}</button>
      </div>
    </div>
    <div class="vc-people">${roster.map(r => {
      const n = NATIONS[r.nation] || NATIONS.karus, c = CLASSES[r.cls] || CLASSES.warrior;
      return `<div class="vp ${r.speaking ? 'talk' : ''} ${r.me ? 'me' : ''}" style="--nc:${n.color};--cc:${c.color}" data-vp="${esc(r.uid)}">
        <div class="vp-av">${charAvatar({ cls: r.cls, nation: r.nation }, 42)}${r.muted ? `<span class="vp-m">${MIC_OFF}</span>` : ''}</div>
        <div class="vp-tx"><b>${esc(r.char || r.name)}</b><span>${esc(r.name)}${r.level ? ' · Lv ' + r.level : ''}</span>
          <span class="vp-st ${r.state === 'bağlı' || r.me ? 'ok' : r.state === 'kurulamadı' ? 'bad' : ''}">${r.me ? (VOICE.muted ? 'mikrofon kapalı' : p.mode === 'ptt' ? (VOICE.pttDown ? 'konuşuyor' : `bas-konuş: ${esc(pttKey().label)}`) : 'mikrofon açık') : r.needsTap ? 'ses için ekrana dokun' : esc(r.state)}</span></div>
        ${!r.me ? `<input class="vp-vol" type="range" min="0" max="100" step="5" value="${p.vol[r.uid] ?? 100}" data-vvol="${esc(r.uid)}" title="Ses düzeyi" aria-label="${esc(r.char || r.name)} ses düzeyi">` : ''}
      </div>`;
    }).join('')}${others <= 1 ? `<div class="vp empty"><span class="mut">Ekipten kimse yok. Arkadaşların Ekip sayfasından "Sese katıl" diyince burada görünür.</span></div>` : ''}</div>
    <div class="vc-set">
      <div class="vc-row"><span class="vc-lbl">Konuşma modu</span><div class="seg">${modeSeg}</div></div>
      ${p.mode === 'vad' ? `<div class="vc-row"><span class="vc-lbl">Hassasiyet</span><div class="vc-meter"><i data-vmeter></i><input type="range" min="2" max="60" value="${p.thr}" data-vthr title="Bu çizginin üstündeki sesler iletilir" aria-label="Hassasiyet"></div></div>` : ''}
      ${p.mode === 'ptt' ? `<div class="vc-row"><span class="vc-lbl">Bas-konuş tuşu</span><select class="inp" data-vkey>${PTT_KEYS.map(k => `<option value="${k.id}" ${k.id === p.key ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select>
        <span class="hint">${VOICE.pttGlobal ? 'Oyun öndeyken de çalışıyor.' : serverMode ? 'Bağlanıyor…' : 'Web sürümünde yalnızca bu sekme öndeyken çalışır; oyun içinde kullanmak için Windows uygulamasını kullan.'} Fare yan tuşu önerilir; harf tuşları oyuna da gider.</span></div>` : ''}
      <div class="vc-row two">
        <label class="f">Mikrofon<select class="inp" data-vmic><option value="">Varsayılan</option>${VOICE.devices.in.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === p.mic ? 'selected' : ''}>${esc(d.label || 'Mikrofon')}</option>`).join('')}</select></label>
        ${VOICE.devices.out.length && 'setSinkId' in HTMLMediaElement.prototype ? `<label class="f">Hoparlör / kulaklık<select class="inp" data-vspk><option value="">Varsayılan</option>${VOICE.devices.out.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === p.spk ? 'selected' : ''}>${esc(d.label || 'Çıkış')}</option>`).join('')}</select></label>` : ''}
      </div>
      <label class="check vc-snd"><input type="checkbox" data-vsnd ${p.sounds ? 'checked' : ''}> Giriş / çıkış sesleri</label>
    </div>
  </div>`;
}
/* sık değişen kısımlar (konuşan halkası, bağlantı durumu) sayfayı baştan çizmeden güncellenir */
function voicePaintLive() {
  const roster = voiceRoster();
  roster.forEach(r => {
    const el = document.querySelector(`[data-vp="${CSS.escape(r.uid)}"]`);
    if (!el) return;
    el.classList.toggle('talk', !!r.speaking);
    const st = el.querySelector('.vp-st');
    if (st && !r.me) { st.textContent = r.needsTap ? 'ses için ekrana dokun' : r.state; st.className = 'vp-st ' + (r.state === 'bağlı' ? 'ok' : r.state === 'kurulamadı' ? 'bad' : ''); }
    if (st && r.me && VOICE.pref.mode === 'ptt') st.textContent = VOICE.muted ? 'mikrofon kapalı' : VOICE.pttDown ? 'konuşuyor' : 'bas-konuş: ' + pttKey().label;
  });
  voiceBar();
}
function voicePaint() {
  if (ui.page === 'ekip') { const h = document.querySelector('.vc-slot'); if (h) h.innerHTML = voicePanel(); else render(); }
  voiceBar();
}
/* her sayfada kenar çubuğunda küçük ses çubuğu */
function voiceBar() {
  let el = document.getElementById('voiceBar');
  const host = document.getElementById('sideExtra');
  if (!host) return;
  if (!el) { el = document.createElement('div'); el.id = 'voiceBar'; host.parentNode.insertBefore(el, host); }
  if (!VOICE.on) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const roster = voiceRoster(), talking = roster.filter(r => r.speaking);
  el.innerHTML = `<div class="vbar ${VOICE.speaking ? 'talk' : ''}">
    <button class="vbar-main" data-act="go" data-id="ekip"><span class="vdot"></span><span><b>Sesli sohbet</b><small>${talking.length ? esc(talking.map(r => r.char || r.name).join(', ')) + ' konuşuyor' : roster.length + ' kişi'}</small></span></button>
    <button class="vbtn sm ${VOICE.muted ? 'off' : ''}" data-act="v-mute" title="Mikrofon">${VOICE.muted ? MIC_OFF : MIC_ON}</button>
    <button class="vbtn sm leave" data-act="v-leave" title="Ayrıl">${PHONE_OFF}</button>
  </div>`;
}

/* Ekip sayfasına ses panelini ekle */
const _ekipView = VIEWS.ekip;
VIEWS.ekip = () => {
  const html = _ekipView();
  return TEAM.doc ? `<div class="vc-slot">${voicePanel()}</div>` + html : html;
};
Object.assign(ACTIONS, {
  'v-join': () => voiceJoin(),
  'v-leave': () => voiceLeave(),
  'v-mute': () => voiceMute(),
  'v-deaf': () => voiceDeaf(),
  'v-mode': el => { VOICE.pref.mode = el.dataset.v; vprefSave(); VOICE.gateUntil = 0; pttStart(); voiceTick(); voicePaint(); },
});
document.addEventListener('input', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.vthr != null) { VOICE.pref.thr = +e.target.value; vprefSave(); }
  if (d.vvol != null) { VOICE.pref.vol[d.vvol] = +e.target.value; vprefSave(); const pe = VOICE.peers.get(d.vvol); if (pe && pe.audio) pe.audio.volume = +e.target.value / 100; }
});
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.vkey != null) { VOICE.pref.key = e.target.value; vprefSave(); pttStart(); voicePaint(); }
  if (d.vmic != null) switchMic(e.target.value);
  if (d.vspk != null) switchSpeaker(e.target.value);
  if (d.vsnd != null) { VOICE.pref.sounds = e.target.checked; vprefSave(); }
});
// otomatik oynatma engellendiyse ilk dokunuşta sesleri başlat
document.addEventListener('pointerdown', () => {
  if (!VOICE.on) return;
  if (VOICE.ctx && VOICE.ctx.state === 'suspended') VOICE.ctx.resume().catch(() => { });
  VOICE.peers.forEach(pe => { if (pe.needsTap && pe.audio) pe.audio.play().then(() => { pe.needsTap = false; voicePaintLive(); }).catch(() => { }); });
}, true);
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => { if (VOICE.on) listDevices(); });

/* ekipten ayrılınca / çıkışta / karakter değişince sesten çık */
const _teamLeave = teamLeave;
teamLeave = async function () { await voiceLeave(true); return _teamLeave(); };
const _logoutV = logout;
logout = async function () { await voiceLeave(true); return _logoutV(); };
const _renderV = render;
render = function () { _renderV(); voiceBar(); };
