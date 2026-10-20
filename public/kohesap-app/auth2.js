'use strict';
/* ==========================================================================
   KO Ekip — giriş ekranları v2 (bağlanılıyor, Google ile giriş, onay, hata)
   • Kalıcı hareketli arka plan (#authFx): ekran yeniden çizilse de akmaya devam eder
   • Giriş: canlı önizleme kartları (boss / event geri sayımı, sesli oda, bildirim)
   • Aynı ekran yeniden çizilince giriş animasyonu tekrar oynamaz
   Akış ve düğmeler (data-act) eskisiyle aynı; yalnızca görünüm değişti.
   ========================================================================== */
(function () {
  const fx = document.createElement('div');
  fx.id = 'authFx'; fx.hidden = true; fx.setAttribute('aria-hidden', 'true');
  fx.innerHTML = '<i class="ax-orb o1"></i><i class="ax-orb o2"></i><i class="ax-orb o3"></i><i class="ax-grid"></i>'
    + Array.from({ length: 22 }, (_, i) => `<i class="ax-em" style="--x:${(i * 37) % 100}%;--d:${6 + (i * 7) % 9}s;--w:${-((i * 13) % 11)}s;--s:${2 + (i % 3)}px;--dx:${((i * 29) % 40) - 20}px"></i>`).join('');
  document.body.appendChild(fx);

  const _show = showAuth, _hide = hideAuth;
  showAuth = function (mode, err) {
    const prev = auth.lastMode, wasOpen = !authEl().hidden;
    _show.apply(this, arguments);
    const el = authEl();
    el.classList.add('v2');
    if (prev === mode && wasOpen) el.classList.add('again');
    fx.hidden = false;
    lxTick();
  };
  hideAuth = function () { _hide.apply(this, arguments); fx.hidden = true; };
})();

const LX_G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const lxSite = p => (serverMode ? SITE : '') + p;
const lxMark = (cls = '') => `<span class="lx-mark ${cls}"><img src="icon.svg" alt="" width="64" height="64"><i class="lx-ring"></i></span>`;

/* ---------- canlı önizleme sayaçları ---------- */
const LX = { t0: Date.now(), timer: null };
const lxClock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
function lxTick() {
  const els = document.querySelectorAll('#auth [data-cd]');
  if (!els.length) { if (LX.timer) { clearInterval(LX.timer); LX.timer = null; } return; }
  const el = (Date.now() - LX.t0) / 1000;
  els.forEach(e => { const total = +e.dataset.cd; e.textContent = lxClock(total - (el % total)); });
  if (!LX.timer) LX.timer = setInterval(lxTick, 1000);
}

function lxPreview() {
  const av = (n, c, talk) => `<span class="lp-av ${talk ? 'talk' : ''}" style="--c:${c}">${n}</span>`;
  return `<div class="lx-stage" aria-hidden="true">
    <div class="lp lp-boss">
      <div class="lp-h"><span class="lp-ic r">${ICON.boss || ''}</span><div><b>Boss alarmı</b><small>Zero · Eslant</small></div><span class="lp-live">canlı</span></div>
      <div class="lp-row"><div><span>Talos</span><b class="gold" data-cd="1122">18:42</b></div><div><span>Troll King</span><b data-cd="3815">01:03:35</b></div></div>
      <div class="lp-bar"><i></i></div>
    </div>
    <div class="lp lp-ev">
      <div class="lp-h"><span class="lp-ic">${ICON.event || ''}</span><div><b>Border Defense War</b><small>Bugün 20:00 · başlamasına</small></div></div>
      <div class="lp-big" data-cd="1829">30:29</div>
    </div>
    <div class="lp lp-voice">
      <div class="lp-h"><span class="lp-ic g">${ICON.ses || ''}</span><div><b>Gece · ses odası</b><small>4 kişi seste</small></div>
        <span class="lp-eq"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="lp-avs">${av('NS', '#e5b450', true)}${av('Kr', '#f26b6b')}${av('El', '#6aa9ff', true)}${av('Pr', '#a594ff')}</div>
    </div>
    <div class="lp lp-cash">
      <div class="lp-h"><span class="lp-ic">${ICON.kasa || ICON.panel || ''}</span><div><b>Bu ay</b><small>gelir − gider</small></div><b class="pos">+1,24m</b></div>
      <svg class="lp-spark" viewBox="0 0 200 48" preserveAspectRatio="none"><path d="M0 40 L20 36 L40 38 L60 28 L80 30 L100 22 L120 25 L140 14 L160 17 L180 8 L200 10"/></svg>
    </div>
    <div class="lp-toast"><span class="lp-tic">🐉</span><div><b>Boss alarmı</b><small>Talos 10 dk sonra çıkıyor · Zero</small></div></div>
  </div>`;
}

/* ---------- ekranlar ---------- */
AUTH_VIEWS.loading = () => `<div class="lx-load">
  ${lxMark('lg')}
  <div class="lx-load-t">KO Ekip</div>
  <div class="lx-load-s">Bağlanılıyor<span class="lx-dots"><i>.</i><i>.</i><i>.</i></span></div>
  <div class="lx-prog"><i></i></div>
</div>`;

AUTH_VIEWS.offline = () => `<div class="lx-card lx-in">
  <div class="lx-card-h">${lxMark()}<div><b>Bağlantı kurulamadı</b><small>KO Ekip</small></div></div>
  <div class="auth-err">${esc(auth.err)}</div>
  <p class="lx-p">KO Ekip kayıtlarını Google hesabında saklar; ilk giriş için internet bağlantısı gerekir.</p>
  <button class="btn pri auth-btn lx-wide" data-act="au-retry">Tekrar dene</button>
</div>`;

AUTH_VIEWS.login = () => `<div class="lx">
  <a class="lx-back" href="${lxSite('/?tanitim')}">← Tanıtım sayfası</a>
  <div class="lx-main">
    <div class="lx-brand lx-in" style="--i:0">${lxMark()}<span><b>KO Ekip</b><small>Knight Online ekip uygulaması</small></span></div>
    <h1 class="lx-h1 lx-in" style="--i:1">Ekibin seni<br><span>bekliyor.</span></h1>
    <p class="lx-lead lx-in" style="--i:2">Boss ve event saatleri, sesli ekip odası, gelir–gider defteri, EXP ve item basma hesapları. Telefonda ve bilgisayarında, tek hesapla.</p>
    ${auth.err ? `<div class="auth-err lx-in" style="--i:3">${esc(auth.err)}</div>` : ''}
    <div class="lx-in" style="--i:3">
      <button class="lx-google" data-act="au-google" ${auth.busy ? 'disabled' : ''}>${auth.busy ? '<span class="lx-spin"></span> Google penceresi açık…' : `${LX_G} Google ile devam et`}</button>
      <div class="lx-trust"><span>Ücretsiz üyelik</span><span>Şifre yok</span><span>Tüm cihazlarında</span></div>
    </div>
    <div class="lx-feats lx-in" style="--i:4">${[['ekip', 'Ekip'], ['ses', 'Sesli oda'], ['boss', 'Boss'], ['event', 'Event'], ['kasa', 'Defter'], ['basma', 'Basma']].map(([k, t]) => `<span>${ICON[k] || ''}${t}</span>`).join('')}</div>
    <div class="lx-legal lx-in" style="--i:5">Devam ederek <a href="${lxSite('/kullanim-sartlari')}" target="_blank" rel="noopener">kullanım şartlarını</a> ve <a href="${lxSite('/gizlilik')}" target="_blank" rel="noopener">gizlilik metnini</a> kabul etmiş olursun.</div>
  </div>
  ${lxPreview()}
</div>`;

AUTH_VIEWS.invite = () => {
  const u = ACC.user || {};
  return `<div class="lx-card lx-in">
    <div class="lx-card-h">${lxMark()}<div><b>Onay bekleniyor</b><small>KO Ekip</small></div></div>
    ${ACC.rulesOld ? `<div class="auth-err">KO Ekip güncelleniyor: yöneticinin yeni Firebase kurallarını yayınlaması gerekiyor. Yöneticiye haber ver.</div>` : `
    <div class="lx-radar"><span class="lx-pulse"></span><span class="lx-pulse p2"></span>${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<b>${esc((u.displayName || u.email || '?').slice(0, 1).toUpperCase())}</b>`}</div>
    <p class="lx-p" style="text-align:center">İsteğin yöneticiye iletildi. Onaylanınca bu ekran <b>kendiliğinden</b> açılır; beklemen yeterli.</p>
    <div class="lx-sep"><span>ya da davet kodun varsa</span></div>
    <form class="invite-form" data-auth-form="invite" onsubmit="return false">
      <input class="inp invite-inp" id="inviteCode" maxlength="12" placeholder="DAVET KODU" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="btn pri auth-btn" data-act="acc-redeem" ${ACC.busy ? 'disabled' : ''}>${ACC.busy ? 'Kontrol ediliyor…' : 'Giriş yap'}</button>
    </form>
    ${ACC.err ? `<div class="auth-err">${esc(ACC.err)}</div>` : ''}
    <div class="invite-wait"><span class="vdot"></span> ${esc(u.email || '')}</div>`}
    <button class="btn ghost" data-act="logout" style="align-self:center">Farklı hesapla gir / çıkış</button>
  </div>`;
};
