'use strict';
/* ==========================================================================
   KARAKTER (SINIF) GÖRSELLERİ
   NTT Game'in resmi rehberindeki 10 sınıf görseli başka sitelere ve veri
   merkezlerine doğrudan verilmiyor. Bu yüzden görseller bir kez alınıp
   Firestore'da saklanır (kohesapAssets/classArt), herkes oradan görür:
     1) Windows uygulaması (admin) görselleri kendi bilgisayarından alıp otomatik kaydeder.
     2) Olmazsa admin, Yönetim sayfasından görselleri elle yükler.
   ========================================================================== */
const ART_KEYS = ['karus1', 'karus2', 'karus3', 'karus4', 'karus5', 'elmorad1', 'elmorad2', 'elmorad3', 'elmorad4', 'elmorad5'];
const ART_LABEL = k => `${k.startsWith('karus') ? 'Karus' : 'El Morad'} ${['Warrior', 'Rogue', 'Mage', 'Priest', k.startsWith('karus') ? 'Kurian' : 'Portu'][+k.slice(-1) - 1]}`;
const ART_CACHE_KEY = 'kohesap-classart';
const ART = { map: {}, at: 0, loaded: false, busy: false, msg: '' };
try { const c = JSON.parse(localStorage.getItem(ART_CACHE_KEY) || 'null'); if (c && c.map) { ART.map = c.map; ART.at = c.at || 0; } } catch { }
const artKey = (cls, nation) => (NATIONS[nation] || NATIONS.karus).art + (CLASSES[cls] || CLASSES.warrior).art;
const artRef = () => FB.doc(CLOUD.db, 'kohesapAssets', 'classArt');
/* Uygulamayla gelen karakter görselleri (art/ klasörü).
   El Morad: Warrior için Barbarian / erkek / kadın; Rogue (okçu ya da assassin), Mage ve
   Priest için erkek / kadın ayrı. Karus: her sınıf için bir görsel, Rogue okçu / assassin ayrı. */
const BUNDLED_BY_KEY = { karus1: 'k-warrior', karus2: 'k-rogue-okcu', karus3: 'k-mage', karus4: 'k-priest', karus5: 'k-kurian', elmorad1: 'h-warrior-barb', elmorad2: 'h-rogue-okcu-m', elmorad3: 'h-mage-m', elmorad4: 'h-priest-m', elmorad5: 'h-portu' };
const ROGUE_TYPES = { okcu: 'Okçu', asas: 'Assassin' };
function bundledArt(ch) {
  const rt = ch.rtype === 'asas' ? 'asas' : 'okcu';
  const fem = /kadın/i.test(ch.race || '');
  if (ch.nation === 'human') {
    switch (ch.cls) {
      case 'warrior': return /barbarian/i.test(ch.race || '') ? 'h-warrior-barb' : fem ? 'h-warrior-f' : 'h-warrior-m';
      case 'rogue': return `h-rogue-${rt}-${fem ? 'f' : 'm'}`;
      case 'mage': return fem ? 'h-mage-f' : 'h-mage-m';
      case 'priest': return fem ? 'h-priest-f' : 'h-priest-m';
      case 'kurian': return 'h-portu';
    }
    return '';
  }
  return { warrior: 'k-warrior', rogue: `k-rogue-${rt}`, mage: 'k-mage', priest: 'k-priest', kurian: 'k-kurian' }[ch.cls] || '';
}
/** Tam boy görsel: admin yüklediyse o, yoksa uygulamayla gelen, yoksa NTT (sunucu üzerinden). */
function charArtSrc(ch) {
  const k = artKey(ch.cls, ch.nation);
  if (ART.map[k]) return ART.map[k];
  const b = bundledArt(ch);
  return b ? `art/${b}.webp` : classArtProxy(ch.cls, ch.nation);
}
/** Yuvarlak fotoğraf için hazır yüz kırpması (varsa). */
function charFaceSrc(ch) {
  if (ART.map[artKey(ch.cls, ch.nation)]) return '';
  const b = bundledArt(ch);
  return b ? `art/${b}-yuz.webp` : '';
}
const classArtSrc = (cls, nation) => charArtSrc({ cls, nation });
const artMissing = () => ART_KEYS.filter(k => !ART.map[k] && !BUNDLED_BY_KEY[k]);

function artRepaint() {
  const a = document.getElementById('auth');
  if (a && !a.hidden && typeof showAuth === 'function' && auth.mode !== 'charForm') showAuth(auth.mode, auth.err);
  else if (a && !a.hidden && auth.mode === 'charForm') showAuth('charForm', auth.err);
  else render();
}
async function artLoad() {
  if (!CLOUD.db) return;
  try {
    const snap = await FB.getDoc(artRef());
    const d = snap.exists() ? snap.data() : null;
    ART.loaded = true;
    if (d && d.imgs && (d.at || 0) !== ART.at) {
      ART.map = d.imgs; ART.at = d.at || 0;
      try { localStorage.setItem(ART_CACHE_KEY, JSON.stringify({ at: ART.at, map: ART.map })); } catch { }
      artRepaint();
    }
  } catch (e) {
    ART.loaded = true;
    if (typeof isPermErr === 'function' && isPermErr(e) && typeof TEAM !== 'undefined') TEAM.rulesMissing = true;
  }
  // admin Windows uygulamasındaysa eksik görselleri kendi bilgisayarından almayı dene
  if (serverMode && isAdmin() && artMissing().length) artAutoFetch(true);
}

/* ---------- görseli küçült (webp) ---------- */
function shrink(img, maxH = 420) {
  const sc = Math.min(1, maxH / img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let u = c.toDataURL('image/webp', 0.84);
  if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/png');
  return u;
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('görsel açılamadı')); i.src = src; });
async function artSave(part) {
  const imgs = { ...ART.map, ...part };
  const size = JSON.stringify(imgs).length;
  if (size > 950000) throw new Error('Görseller çok büyük (' + Math.round(size / 1024) + ' KB). Daha küçük görseller yükleyin.');
  const at = Date.now();
  await FB.setDoc(artRef(), { imgs, at, by: CLOUD.user.email || '' });
  ART.map = imgs; ART.at = at;
  try { localStorage.setItem(ART_CACHE_KEY, JSON.stringify({ at, map: imgs })); } catch { }
  artRepaint();
}
/* Windows uygulaması: görselleri bilgisayardan (NTT sitesinden geliyormuş gibi) al */
async function artAutoFetch(quiet) {
  if (!serverMode || ART.busy) return;
  ART.busy = true; ART.msg = 'Görseller alınıyor…'; if (!quiet) render();
  const got = {};
  // yalnızca eksikler (uygulamayla gelen ya da admin'in yüklediği görsellerin üzerine yazılmaz)
  for (const k of artMissing()) {
    try { got[k] = shrink(await loadImg('/api/img?h=ntt&p=' + encodeURIComponent(`/knight/ver2018/assets/images/guide/character_${k}.png`))); } catch { }
  }
  const n = Object.keys(got).length;
  try {
    if (n) { await artSave(got); ART.msg = `${n} görsel NTT'den alınıp herkes için kaydedildi.`; if (!quiet || n) toast(ART.msg, 'ok'); }
    else ART.msg = artMissing().length ? 'Eksik görseller NTT\'den bu bilgisayardan da alınamadı. Aşağıdan elle yükleyebilirsin.' : 'Eksik görsel yok.';
  } catch (e) { ART.msg = 'Kaydedilemedi: ' + e.message; if (!quiet) toast(ART.msg, 'err'); }
  ART.busy = false; if (!quiet) render();
}
/* Elle yükleme: dosya adında karus1…elmorad5 geçiyorsa otomatik eşleşir */
async function artUpload(files, forceKey) {
  const got = {}, skipped = [];
  for (const f of files) {
    const m = String(f.name).toLowerCase().match(/(karus|elmorad)\s*_?([1-5])/);
    const k = forceKey || (m ? m[1] + m[2] : '');
    if (!k) { skipped.push(f.name); continue; }
    const url = URL.createObjectURL(f);
    try { got[k] = shrink(await loadImg(url)); } catch { skipped.push(f.name); } finally { URL.revokeObjectURL(url); }
  }
  if (Object.keys(got).length) {
    try { await artSave(got); toast(`${Object.keys(got).length} görsel kaydedildi`, 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }
  if (skipped.length) toast('Eşleştirilemedi: ' + skipped.join(', ') + ' (dosya adında ör. karus1 olmalı ya da ilgili kutuya tek tek yükle)', 'err');
}

/* ---------- Yönetim sayfası: görsel kartı (yalnızca admin) ---------- */
function artAdminCard() {
  const miss = artMissing();
  return `<div class="card art-admin" style="margin-bottom:16px">
    <div class="card-h"><div><h3>Karakter görselleri <span class="badge y">admin</span> ${miss.length ? `<span class="badge r">${miss.length} eksik</span>` : '<span class="badge g">tamam</span>'}</h3>
      <div class="sub">Karakter seçim ekranı, ekip ve sesli sohbetteki sınıf görselleri. "Hazır" olanlar uygulamayla geliyor (El Morad Rogue/Priest kadın-erkek ayrı). Eksikleri veya değiştirmek istediklerini buradan yükle; herkes görür.</div></div></div>
    <div class="art-grid">${ART_KEYS.map(k => { const src = ART.map[k] || (BUNDLED_BY_KEY[k] ? `art/${BUNDLED_BY_KEY[k]}.webp` : ''); return `<label class="art-slot ${src ? 'has' : ''}" title="${esc(ART_LABEL(k))} — değiştirmek için tıkla">
      ${src ? `<img src="${src}" alt="">` : '<span class="mut">yok</span>'}${ART.map[k] ? '<i class="art-tag">yüklendi</i>' : BUNDLED_BY_KEY[k] ? '<i class="art-tag b">hazır</i>' : ''}
      <b>${esc(ART_LABEL(k))}</b><input type="file" accept="image/*" data-art-one="${k}" hidden></label>`; }).join('')}</div>
    <div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">
      ${serverMode ? `<button class="btn pri" data-act="art-auto" ${ART.busy ? 'disabled' : ''}>${ART.busy ? 'Alınıyor…' : 'NTT\'den otomatik al'}</button>` : ''}
      <label class="btn ${serverMode ? '' : 'pri'}">Görselleri yükle (çoklu)<input type="file" accept="image/*" multiple data-art-many hidden></label>
      <a class="btn ghost" href="https://www.nttgame.com/knight/tr/guide/character" target="_blank" rel="noopener">NTT karakter rehberini aç ↗</a>
    </div>
    <div class="hint" style="margin-top:8px">${ART.msg ? esc(ART.msg) + ' ' : ''}${serverMode ? 'Otomatik alma bu bilgisayardan NTT\'ye bağlanır. ' : ''}Elle: rehber sayfasında her sınıf görseline sağ tıkla → "Resmi farklı kaydet". Dosya adları (character_karus1.png …) olduğu gibi kalırsa toplu yüklemede kendiliğinden eşleşir; ya da yukarıdaki kutulara tek tek yükle.</div>
  </div>`;
}
const _internetView = VIEWS.internet;
VIEWS.internet = () => {
  if (isAdmin() && typeof teamRulesProbe === 'function' && !TEAM.rulesChecked) setTimeout(teamRulesProbe, 0);
  return (isAdmin() && TEAM.rulesMissing ? rulesBox() : '') + (isAdmin() ? artAdminCard() : '') + _internetView();
};
Object.assign(ACTIONS, { 'art-auto': () => artAutoFetch(false) });
document.addEventListener('change', e => {
  const d = e.target.dataset; if (!d) return;
  if (d.artOne && e.target.files.length) artUpload([e.target.files[0]], d.artOne);
  if (d.artMany != null && e.target.files.length) artUpload([...e.target.files]);
});
