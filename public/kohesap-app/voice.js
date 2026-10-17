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
const VOICE_STALE = 200e3;     // bu kadar süre nabız gelmeyen kişi odadan düşmüş sayılır
const VOICE_HB = 60e3;   // seyrek nabız: Firebase ücretsiz kotası için (8 kişi, saatler süren oturum)
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
  pref: Object.assign({ mode: 'vad', thr: 12, key: 'Mouse4', mic: '', spk: '', vol: {}, sounds: true, q: 'hi', ns: true, agc: true }, vprefLoad()),
  raw: {}, watchCode: '', watchUnsub: null,
};
const vprefSave = () => { try { localStorage.setItem(VPREF_KEY, JSON.stringify(VOICE.pref)); } catch { } };
const voiceCol = (code = VOICE.code) => FB.collection(CLOUD.db, 'kohesapTeams', code, 'voice');
/* ses kalitesi (Opus) */
const VQUAL = { std: { kbps: 40, label: 'Standart · 40 kbps' }, hi: { kbps: 64, label: 'Yüksek · 64 kbps (önerilen)' }, max: { kbps: 96, label: 'En yüksek · 96 kbps' } };
const vBitrate = () => (VQUAL[VOICE.pref.q] || VQUAL.hi).kbps * 1000;
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
    if (s === 'connected') { blip(true); pe.okAt = Date.now(); tuneSender(pe); }
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
/* Opus: kayıp düzeltme açık, sessizlikte kesme (DTX) kapalı (kelime başları kırpılmasın), mono 48 kHz, seçilen bit hızı */
const tuneSdp = sdp => sdp.replace(/(a=fmtp:\d+ )([^\r\n]*useinbandfec=1[^\r\n]*)/, (m, a, b) =>
  a + b.split(';').filter(x => x && !/^(usedtx|maxaveragebitrate|stereo|sprop-stereo|maxplaybackrate|cbr)=/.test(x)).concat(['usedtx=0', 'stereo=0', 'sprop-stereo=0', 'maxplaybackrate=48000', 'maxaveragebitrate=' + vBitrate()]).join(';'));
/* gönderici: bit hızı ve öncelik (ses paketleri ağda önde gitsin) */
async function tuneSender(pe) {
  for (const s of pe.pc.getSenders()) {
    if (!s.track || s.track.kind !== 'audio') continue;
    try {
      const prm = s.getParameters();
      if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
      prm.encodings[0].maxBitrate = vBitrate();
      prm.encodings[0].priority = 'high';
      prm.encodings[0].networkPriority = 'high';
      await s.setParameters(prm);
    } catch { }
  }
}
/* bağlantı kalitesi: gecikme (ms), paket kaybı (%), aktarma sunucusu üzerinden mi */
async function peerStats(pe) {
  try {
    const st = await pe.pc.getStats();
    let rtt = null, recv = 0, lost = 0, relay = false, jit = null, pairLocal = null;
    st.forEach(r => {
      if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { if (r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000; pairLocal = r.localCandidateId; }
      if (r.type === 'inbound-rtp' && r.kind === 'audio') { recv = r.packetsReceived || 0; lost = r.packetsLost || 0; if (r.jitter != null) jit = r.jitter * 1000; }
    });
    if (pairLocal) { const lc = st.get(pairLocal); relay = !!(lc && lc.candidateType === 'relay'); }
    const dR = recv - (pe.lastRecv || 0), dL = lost - (pe.lastLost || 0);
    pe.lastRecv = recv; pe.lastLost = lost;
    pe.loss = dR + dL > 0 ? Math.max(0, dL) / (dR + dL) * 100 : 0;
    pe.rtt = rtt; pe.jit = jit; pe.relay = relay;
    pe.qual = rtt == null ? 0 : (rtt < 120 && pe.loss < 2) ? 3 : (rtt < 250 && pe.loss < 6) ? 2 : 1;
  } catch { }
}
function voiceStatsTick() { if (!VOICE.on) return; Promise.all([...VOICE.peers.values()].filter(pe => pe.pc.connectionState === 'connected').map(peerStats)).then(() => voicePaintLive()); }
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
  const raw = {}; snap.forEach(d => { const v = d.data(); if (v) raw[d.id] = v; });
  VOICE.raw = raw; applyPresence();
}
function applyPresence() {
  const now = Date.now(), seen = {};
  Object.entries(VOICE.raw).forEach(([u, v]) => { if (now - (v.hb || 0) < VOICE_STALE) seen[u] = v; });
  const before = new Set(Object.keys(VOICE.presence));
  VOICE.presence = seen;
  const me = myUid();
  if (!VOICE.on) { voicePaint(); return; }            // katılmadan yalnızca odadakileri göster
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

/* odadakileri katılmadan da izle (ekip varken) */
function voiceWatchPresence() {
  const code = TEAM.doc && CLOUD.db ? TEAM.code : '';
  if (code === VOICE.watchCode) return;
  if (VOICE.watchUnsub) { try { VOICE.watchUnsub(); } catch { } VOICE.watchUnsub = null; }
  VOICE.watchCode = code; VOICE.raw = {}; VOICE.presence = {};
  if (code) VOICE.watchUnsub = FB.onSnapshot(voiceCol(code), onPresence, e => { if (isPermErr(e)) TEAM.rulesMissing = true; });
}
setInterval(() => { voiceWatchPresence(); if (VOICE.watchCode) applyPresence(); }, 20000);

/* ---------- katıl / ayrıl ---------- */
async function getMic() {
  const p = VOICE.pref;
  const c = { echoCancellation: true, noiseSuppression: p.ns !== false, autoGainControl: p.agc !== false, channelCount: 1, sampleRate: 48000, sampleSize: 16 };
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
  return { name: (CLOUD.user.displayName || '').slice(0, 40) || 'Oyuncu', char: ch.name || '', cls: ch.cls || 'warrior', nation: ch.nation || 'karus', race: ch.race || '', rtype: ch.rtype || 'okcu', level: +ch.level || 0, muted: VOICE.muted, deaf: VOICE.deaf, sid: VOICE.sid, hb: Date.now() };
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
    voiceWatchPresence(); applyPresence();
    VOICE.hbTimer = setInterval(beat, VOICE_HB);
    VOICE.levelTimer = setInterval(voiceTick, 60);
    VOICE.watchTimer = setInterval(voiceWatch, 3000);
    VOICE.statsTimer = setInterval(voiceStatsTick, 2000);
    pttStart();
    listDevices();
    blip(true);
    toast('Sesli sohbete katıldın', 'ok');
    if (ui.page !== 'ses') { ui.page = 'ses'; render(); }
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
  clearInterval(VOICE.hbTimer); clearInterval(VOICE.levelTimer); clearInterval(VOICE.watchTimer); clearInterval(VOICE.statsTimer);
  pttStop();
  [...VOICE.peers.keys()].forEach(closePeer);
  if (VOICE.stream) VOICE.stream.getTracks().forEach(t => t.stop());
  try { VOICE.localAn && VOICE.localAn.src.mediaStream.getTracks().forEach(t => t.stop()); } catch { }
  VOICE.stream = null; VOICE.sendTrack = null; VOICE.localAn = null; VOICE.speaking = false;
  if (was && myUid()) { delete VOICE.raw[myUid()]; applyPresence(); }
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
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
ICON.ses = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/></svg>';
PAGES.splice(PAGES.findIndex(p => p.id === 'ekip') + 1, 0, { id: 'ses', t: 'Ses & Sohbet', d: 'Ekip sesli sohbeti, yazışma ve bot' });

/* ekipteki herkes: seste olanlar canlı bilgileriyle, olmayanlar ana karakteriyle */
function voiceRoster(all) {
  const me = myUid(), list = [], seen = new Set();
  Object.entries(VOICE.presence).forEach(([u, v]) => {
    seen.add(u);
    const pe = VOICE.peers.get(u);
    list.push({ uid: u, ...v, inVoice: true, me: u === me,
      speaking: u === me ? VOICE.on && VOICE.speaking : !!(VOICE.on && pe && pe.speaking),
      state: u === me ? 'sen' : !VOICE.on ? 'seste' : pe ? pe.state : 'bağlanıyor', needsTap: pe && pe.needsTap, pe });
  });
  if (all && typeof teamMembers === 'function') teamMembers().forEach(m => {
    if (seen.has(m.uid)) return;
    const c = m.mainChar || {};
    list.push({ uid: m.uid, name: m.name, char: c.name || '', cls: c.cls || 'warrior', nation: c.nation || 'karus', race: c.race || '', rtype: c.rtype || 'okcu', level: c.level || 0, master: c.master, inVoice: false, me: m.uid === me });
  });
  return list.sort((a, b) => (b.inVoice - a.inVoice) || (b.me - a.me) || String(a.char || a.name).localeCompare(String(b.char || b.name), 'tr'));
}
const qualBars = pe => {
  if (!pe || !pe.qual) return '';
  const tip = `${pe.rtt != null ? Math.round(pe.rtt) + ' ms' : ''}${pe.loss ? ' · %' + nf2.format(pe.loss) + ' kayıp' : ''}${pe.relay ? ' · aktarma sunucusu' : ' · doğrudan'}`;
  return `<span class="qbars q${pe.qual}" title="Bağlantı: ${esc(tip)}"><i></i><i></i><i></i></span><span class="qms">${pe.rtt != null ? Math.round(pe.rtt) + ' ms' : ''}</span>`;
};
function tileState(r) {
  if (!r.inVoice) return 'seste değil';
  if (r.me) return VOICE.muted ? 'mikrofon kapalı' : VOICE.pref.mode === 'ptt' ? (VOICE.pttDown ? 'konuşuyor' : 'bas-konuş: ' + pttKey().label) : 'mikrofon açık';
  if (r.needsTap) return 'ses için ekrana dokun';
  return r.state;
}
function voiceTile(r) {
  const n = NATIONS[r.nation] || NATIONS.karus, c = CLASSES[r.cls] || CLASSES.warrior;
  const title = r.level ? jobTitle({ cls: r.cls, nation: r.nation, level: r.level, master: r.master }) : classLabel(r.cls, r.nation);
  return `<div class="vt ${r.speaking ? 'talk' : ''} ${r.inVoice ? '' : 'away'} ${r.me ? 'me' : ''}" style="--nc:${n.color};--cc:${c.color}" data-vp="${esc(r.uid)}">
    <div class="vt-av">${charAvatar({ cls: r.cls, nation: r.nation, race: r.race, rtype: r.rtype }, 84)}<span class="vt-wave"></span>
      ${r.inVoice && (r.muted || r.deaf) ? `<span class="vt-mute" title="${r.deaf ? 'Sesi kapalı' : 'Mikrofonu kapalı'}">${r.deaf ? HEAD_OFF : MIC_OFF}</span>` : ''}</div>
    <b class="vt-name">${esc(r.char || r.name)}</b>
    <span class="vt-sub" lang="en">${esc(title)}</span>
    <span class="vt-who">${r.level ? 'Lv ' + r.level + ' · ' : ''}${esc(r.name || '')}${r.me ? ' · sen' : ''}</span>
    <span class="vt-st ${r.state === 'bağlı' || r.me ? 'ok' : r.state === 'kurulamadı' ? 'bad' : ''}">${VOICE.on && !r.me && r.inVoice ? qualBars(r.pe) : ''}<span class="vt-stx">${esc(tileState(r))}</span></span>
    ${VOICE.on && r.inVoice && !r.me ? `<input class="vt-vol" type="range" min="0" max="100" step="5" value="${VOICE.pref.vol[r.uid] ?? 100}" data-vvol="${esc(r.uid)}" title="Ses düzeyi" aria-label="${esc(r.char || r.name)} ses düzeyi">` : ''}
  </div>`;
}
function voiceSettings() {
  const p = VOICE.pref;
  const modeSeg = [['vad', 'Ses algılama'], ['ptt', 'Bas-konuş'], ['open', 'Açık mikrofon']].map(([k, l]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="v-mode" data-v="${k}">${l}</button>`).join('');
  return `<div class="vc-set">
    <div class="vc-row"><span class="vc-lbl">Konuşma modu</span><div class="seg">${modeSeg}</div></div>
    ${p.mode === 'vad' ? `<div class="vc-row"><span class="vc-lbl">Hassasiyet</span><div class="vc-meter"><i data-vmeter></i><input type="range" min="2" max="60" value="${p.thr}" data-vthr title="Bu çizginin üstündeki sesler iletilir" aria-label="Hassasiyet"></div><span class="hint">Konuşurken çubuk yeşile dönmeli; arka plan sesi yeşile geçiyorsa çizgiyi sağa çek.</span></div>` : ''}
    ${p.mode === 'ptt' ? `<div class="vc-row"><span class="vc-lbl">Bas-konuş tuşu</span><select class="inp" data-vkey>${PTT_KEYS.map(k => `<option value="${k.id}" ${k.id === p.key ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select>
      <span class="hint">${VOICE.pttGlobal ? 'Oyun öndeyken de çalışıyor.' : serverMode ? 'Bağlanıyor…' : 'Web sürümünde yalnızca bu sekme öndeyken çalışır; oyun içinde kullanmak için Windows uygulamasını kullan.'} Fare yan tuşu önerilir; harf tuşları oyuna da gider.</span></div>` : ''}
    <div class="vc-row two">
      <label class="f">Mikrofon<select class="inp" data-vmic><option value="">Varsayılan</option>${VOICE.devices.in.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === p.mic ? 'selected' : ''}>${esc(d.label || 'Mikrofon')}</option>`).join('')}</select></label>
      ${VOICE.devices.out.length && 'setSinkId' in HTMLMediaElement.prototype ? `<label class="f">Hoparlör / kulaklık<select class="inp" data-vspk><option value="">Varsayılan</option>${VOICE.devices.out.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === p.spk ? 'selected' : ''}>${esc(d.label || 'Çıkış')}</option>`).join('')}</select></label>` : '<span></span>'}
      <label class="f">Ses kalitesi<select class="inp" data-vq>${Object.entries(VQUAL).map(([k, v]) => `<option value="${k}" ${k === (p.q || 'hi') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select><span class="hint">Herkes için 8 kişide bile rahat; internet zayıfsa Standart seç.</span></label>
      <div class="f vc-checks"><label class="check"><input type="checkbox" data-vns ${p.ns !== false ? 'checked' : ''}> Gürültü engelleme</label><label class="check"><input type="checkbox" data-vagc ${p.agc !== false ? 'checked' : ''}> Otomatik ses seviyesi</label><label class="check"><input type="checkbox" data-vsnd ${p.sounds ? 'checked' : ''}> Giriş / çıkış sesleri</label></div>
    </div>
  </div>`;
}
function voiceMain() {
  const roster = voiceRoster(true), inRoom = roster.filter(r => r.inVoice);
  const talking = inRoom.filter(r => r.speaking);
  return `<div class="vs-head">
      <div class="vc-ico ${VOICE.on ? 'live' : ''}">${HEAD_ON}</div>
      <div><h3>${esc(TEAM.doc.name || 'Ekip')} · ses odası ${VOICE.on ? '<span class="badge g">bağlısın</span>' : ''}</h3>
        <span class="mut">${inRoom.length ? `${inRoom.length} kişi seste${talking.length ? ' · <b class="talk-txt">' + esc(talking.map(r => r.char || r.name).join(', ')) + ' konuşuyor</b>' : ''}` : 'Şu an seste kimse yok'}</span></div>
      <span class="spacer"></span>
      ${VOICE.on ? '' : `<button class="btn pri vs-join" data-act="v-join" ${VOICE.joining ? 'disabled' : ''}>${VOICE.joining ? 'Bağlanıyor…' : `${MIC_ON} Sese katıl`}</button>`}
    </div>
    ${VOICE.err ? `<div class="callout r" style="margin-top:12px">${esc(VOICE.err)}</div>` : ''}
    <div class="vt-grid">${roster.map(voiceTile).join('')}</div>
    ${VOICE.on ? `<div class="vs-bar">
      <button class="vbtn lg ${VOICE.muted ? 'off' : ''}" data-act="v-mute" title="${VOICE.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}">${VOICE.muted ? MIC_OFF : MIC_ON}</button>
      <button class="vbtn lg ${VOICE.deaf ? 'off' : ''}" data-act="v-deaf" title="${VOICE.deaf ? 'Sesi aç' : 'Herkesi sustur'}">${VOICE.deaf ? HEAD_OFF : HEAD_ON}</button>
      <button class="vbtn lg ${ui.vset ? 'on' : ''}" data-act="v-set" title="Ses ayarları">${GEAR}</button>
      <button class="vbtn lg leave" data-act="v-leave" title="Sesten ayrıl">${PHONE_OFF}</button>
    </div>` : `<div class="hint vs-tip">Ses doğrudan ekip üyeleri arasında gider, hiçbir yere kaydedilmez. Oyunda kulaklık kullan; Windows uygulamasında bas-konuş tuşu oyun öndeyken de çalışır.</div>`}
    ${VOICE.on && ui.vset ? voiceSettings() : ''}`;
}
VIEWS.ses = () => {
  if (!TEAM.doc) return `<div class="card">${empty('Önce bir ekip kur ya da ekibe katıl', 'Sesli sohbet ve yazışma ekip üyeleri arasında çalışır.')}<div style="text-align:center;margin-top:12px"><button class="btn pri" data-act="go" data-id="ekip">Ekip sayfasına git</button></div></div>`;
  voiceWatchPresence();
  return (TEAM.rulesMissing && typeof rulesBox === 'function' ? rulesBox() : '') + `<div class="vs">
    <section class="card vs-main">${voiceMain()}</section>
    <section class="card vs-chat">${typeof chatPanel === 'function' ? chatPanel() : ''}</section>
  </div>`;
};

/* sık değişen kısımlar (konuşan, bağlantı) sayfayı baştan çizmeden güncellenir */
function voicePaintLive() {
  voiceRoster(true).forEach(r => {
    const el = document.querySelector(`[data-vp="${CSS.escape(r.uid)}"]`);
    if (!el) return;
    el.classList.toggle('talk', !!r.speaking);
    const st = el.querySelector('.vt-st');
    if (st) {
      st.className = 'vt-st ' + (r.state === 'bağlı' || r.me ? 'ok' : r.state === 'kurulamadı' ? 'bad' : '');
      st.innerHTML = `${VOICE.on && !r.me && r.inVoice ? qualBars(r.pe) : ''}<span class="vt-stx">${esc(tileState(r))}</span>`;
    }
  });
  const tt = document.querySelector('.vs-head .mut');
  if (tt) {
    const inRoom = voiceRoster(false), talking = inRoom.filter(r => r.speaking);
    tt.innerHTML = inRoom.length ? `${inRoom.length} kişi seste${talking.length ? ' · <b class="talk-txt">' + esc(talking.map(r => r.char || r.name).join(', ')) + ' konuşuyor</b>' : ''}` : 'Şu an seste kimse yok';
  }
  voiceBar();
}
function voicePaint() {
  if (ui.page === 'ses') { const h = document.querySelector('.vs-main'); if (h) h.innerHTML = voiceMain(); else render(); }
  else if (ui.page === 'ekip') { const h = document.querySelector('.vc-slot'); if (h) h.innerHTML = voiceTeaser(); }
  voiceBar();
}
/* Ekip sayfasında küçük tanıtım + kısayol */
function voiceTeaser() {
  if (!TEAM.doc) return '';
  const inRoom = voiceRoster(false);
  return `<div class="card vc-teaser">
    <div class="vc-ico ${VOICE.on ? 'live' : ''}">${HEAD_ON}</div>
    <div><h3>Ses & Sohbet</h3><span class="mut">${inRoom.length ? `${inRoom.length} kişi seste: ${esc(inRoom.map(r => r.char || r.name).join(', '))}` : 'Seste kimse yok'}${typeof CHAT !== 'undefined' && CHAT.unread ? ` · <b class="gold">${CHAT.unread} yeni mesaj</b>` : ''}</span></div>
    <span class="spacer"></span>
    <div class="vt-mini">${inRoom.slice(0, 8).map(r => charAvatar({ cls: r.cls, nation: r.nation, race: r.race, rtype: r.rtype }, 30)).join('')}</div>
    <button class="btn pri" data-act="go" data-id="ses">${VOICE.on ? 'Odaya dön' : 'Odaya git'}</button>
  </div>`;
}
/* her sayfada kenar çubuğunda küçük ses çubuğu */
function voiceBar() {
  let el = document.getElementById('voiceBar');
  const host = document.getElementById('sideExtra');
  if (!host) return;
  if (!el) { el = document.createElement('div'); el.id = 'voiceBar'; host.parentNode.insertBefore(el, host); }
  if (!VOICE.on) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const roster = voiceRoster(false), talking = roster.filter(r => r.speaking);
  el.innerHTML = `<div class="vbar ${talking.length ? 'talk' : ''}">
    <button class="vbar-main" data-act="go" data-id="ses"><span class="vdot"></span><span><b>Sesli sohbet</b><small>${talking.length ? esc(talking.map(r => r.char || r.name).join(', ')) + ' konuşuyor' : roster.length + ' kişi'}</small></span></button>
    <button class="vbtn sm ${VOICE.muted ? 'off' : ''}" data-act="v-mute" title="Mikrofon">${VOICE.muted ? MIC_OFF : MIC_ON}</button>
    <button class="vbtn sm leave" data-act="v-leave" title="Ayrıl">${PHONE_OFF}</button>
  </div>`;
}

const _ekipView = VIEWS.ekip;
VIEWS.ekip = () => {
  const html = _ekipView();
  if (TEAM.doc) voiceWatchPresence();
  return TEAM.doc ? `<div class="vc-slot">${voiceTeaser()}</div>` + html : html;
};
async function voiceReMic() { if (VOICE.on) await switchMic(VOICE.pref.mic); }
Object.assign(ACTIONS, {
  'v-join': () => voiceJoin(),
  'v-leave': () => voiceLeave(),
  'v-mute': () => voiceMute(),
  'v-deaf': () => voiceDeaf(),
  'v-set': () => { ui.vset = !ui.vset; if (ui.vset) listDevices(); voicePaint(); },
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
  if (d.vq != null) {
    VOICE.pref.q = e.target.value; vprefSave();
    // yeni bit hızı: göndericiye hemen uygula, karşı taraf için bağlantıyı yenile
    VOICE.peers.forEach((pe, u) => { tuneSender(pe); if (pe.offerer) makeOffer(u, false).catch(() => { }); });
    toast('Ses kalitesi: ' + VQUAL[VOICE.pref.q].label, 'ok');
  }
  if (d.vns != null) { VOICE.pref.ns = e.target.checked; vprefSave(); voiceReMic(); }
  if (d.vagc != null) { VOICE.pref.agc = e.target.checked; vprefSave(); voiceReMic(); }
});
// otomatik oynatma engellendiyse ilk dokunuşta sesleri başlat
document.addEventListener('pointerdown', () => {
  if (!VOICE.on) return;
  if (VOICE.ctx && VOICE.ctx.state === 'suspended') VOICE.ctx.resume().catch(() => { });
  VOICE.peers.forEach(pe => { if (pe.needsTap && pe.audio) pe.audio.play().then(() => { pe.needsTap = false; voicePaintLive(); }).catch(() => { }); });
}, true);
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => { if (VOICE.on) listDevices(); });

/* ekipten ayrılınca / çıkışta sesten çık */
const _teamLeave = teamLeave;
teamLeave = async function () { await voiceLeave(true); return _teamLeave(); };
const _logoutV = logout;
logout = async function () { await voiceLeave(true); if (VOICE.watchUnsub) { VOICE.watchUnsub(); VOICE.watchUnsub = null; } VOICE.watchCode = ''; return _logoutV(); };
const _renderV = render;
render = function () { _renderV(); voiceBar(); };
