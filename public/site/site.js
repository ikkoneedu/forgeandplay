// KO Ekip tanıtım sitesi: güncel plan (fiyat, hangi özellik VIP) ve küçük etkileşimler
(function () {
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.menu a');
    if (a) document.body.classList.remove('nav-open');
  });
  var NAMES = {
    ekip: 'Ekip kur, 8 kişi', planla: 'Ekip planı, yoklama ve drop sırası', lfg: 'Ekip bul panosu', gunluk: 'Günlük görevler', grind: 'Grind takibi', sesli: 'Sesli ekip odası', boss: 'Boss alarmı', event: 'Event takvimi', bildirim: 'Telefon bildirimleri',
    kasa: 'Gelir–gider defteri', ticaret: 'Item ticareti ve drop payı', exp: 'EXP ve PUS hesabı', basma: 'Item basma simülatörü',
    gb: 'Canlı GB fiyatları', pazar: 'Canlı pazar', ilan: 'Site ilanları'
  };
  // giriş yapmış üye: üst menüde "Uygulamaya dön", düğmeler uygulamaya götürür
  var member = false, name = '', photo = '';
  try { member = localStorage.getItem('koekip.in') === '1'; name = localStorage.getItem('koekip.name') || ''; photo = localStorage.getItem('koekip.photo') || ''; } catch (e) { }
  if (member) {
    document.body.classList.add('is-member');
    var cta = document.querySelector('.top-cta');
    if (cta) {
      cta.innerHTML = '';
      var who = document.createElement('span'); who.className = 'me';
      if (photo) { var im = document.createElement('img'); im.src = photo; im.alt = ''; im.referrerPolicy = 'no-referrer'; who.appendChild(im); }
      var nm = document.createElement('span'); nm.textContent = name ? name.split(' ')[0] : 'Hesabım'; who.appendChild(nm);
      var go = document.createElement('a'); go.className = 'btn pri'; go.href = '/app'; go.innerHTML = '<span class="lg-only">Uygulamaya dön</span><span class="sm-only">Uygulama</span> →';
      cta.appendChild(who); cta.appendChild(go);
    }
    document.querySelectorAll('a.btn[href="/app"]').forEach(function (a) {
      if (a.closest('.top-cta')) return;
      a.textContent = 'Uygulamayı aç →';
    });
    var shot = document.querySelector('.hero .shot'); if (shot) shot.hidden = true;
    var eb = document.querySelector('.hero .eyebrow');
    if (eb && name) eb.innerHTML = '<b>Hoş geldin</b> ' + name.split(' ')[0].replace(/[<>&"]/g, '') + ' · güncel haberler aşağıda';
  }
  // telefona / bilgisayara uygulama olarak yükle (Android Chrome, Edge, masaüstü Chrome)
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    var row = document.querySelector('.hero .cta-row'); if (!row || row.querySelector('.inst')) return;
    var b = document.createElement('button'); b.className = 'btn lg inst'; b.type = 'button'; b.textContent = '📲 Telefona yükle';
    b.onclick = function () { e.prompt(); e.userChoice.finally(function () { b.remove(); }); };
    row.appendChild(b);
  });
  // yeni sunucu geri sayımı
  document.querySelectorAll('[data-cd]').forEach(function (el) {
    var t = new Date(el.getAttribute('data-cd')).getTime();
    var tick = function () { var m = t - Date.now(); if (m <= 0) { el.textContent = 'Sunucular açık'; return; } var d = Math.floor(m / 864e5), h = Math.floor(m % 864e5 / 36e5), n = Math.floor(m % 36e5 / 6e4), x = Math.floor(m % 6e4 / 1e3); el.textContent = d + 'g ' + String(h).padStart(2, '0') + ':' + String(n).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
    tick(); setInterval(tick, 1000);
  });
  // güncel haberler (herkese açık başlıklar)
  var nl = document.querySelector('[data-news]');
  if (nl) fetch('/api/kohesap/news?pub=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var it = (d && d.items) || [];
    if (!it.length) { nl.innerHTML = '<li class="muted" style="padding:10px 2px">Henüz haber yok. Yeni duyurular burada görünecek.</li>'; return; }
    var ago = function (t) { var m = Math.round((Date.now() - t) / 6e4); return m < 60 ? Math.max(1, m) + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' sa önce' : Math.round(m / 1440) + ' gün önce'; };
    nl.innerHTML = '';
    it.slice(0, 5).forEach(function (x) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = x.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
      var b = document.createElement('b'); b.textContent = x.t;
      var sm = document.createElement('small');
      if (x.off || x.yeni) { var tg = document.createElement('span'); tg.className = 'tg' + (x.off ? ' off' : ''); tg.textContent = x.off ? 'resmî' : 'yeni sunucu'; sm.appendChild(tg); }
      sm.appendChild(document.createTextNode((x.src || '') + ' · ' + ago(x.pub || x.at)));
      a.appendChild(b); a.appendChild(sm); li.appendChild(a); nl.appendChild(li);
    });
  }).catch(function () { nl.innerHTML = '<li class="muted" style="padding:10px 2px">Haberler şu an alınamadı.</li>'; });
  if (!document.querySelector('[data-feat],[data-price]')) return;
  fetch('/api/kohesap/plan').then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p || !p.ok) return;
    var f = p.features || {};
    document.querySelectorAll('[data-price]').forEach(function (el) { if (p.price) el.textContent = p.price + ' TL'; });
    document.querySelectorAll('[data-feat]').forEach(function (el) {
      var t = f[el.dataset.feat];
      var card = el.closest('.card');
      if (t === 'kapali') { if (card) card.hidden = true; return; }
      el.className = 'tier' + (t === 'vip' ? ' vip' : '');
      el.textContent = t === 'vip' ? 'VIP' : 'Ücretsiz';
    });
    var uye = document.querySelector('[data-plan=uye]'), vip = document.querySelector('[data-plan=vip]');
    if (uye && vip) {
      var li = function (n) { var x = document.createElement('li'); x.textContent = n; return x; };
      uye.innerHTML = ''; vip.innerHTML = '';
      Object.keys(NAMES).forEach(function (id) {
        if (f[id] === 'vip') vip.appendChild(li(NAMES[id]));
        else if (f[id] !== 'kapali') uye.appendChild(li(NAMES[id]));
      });
      if (p.teamVip) vip.appendChild(li("Ekip VIP'i: lider VIP ise tüm ekip sesli odada"));
    }
  }).catch(function () { });
})();
