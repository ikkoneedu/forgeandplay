// KO Ekip tanıtım sitesi: güncel plan (fiyat, hangi özellik VIP) ve küçük etkileşimler
(function () {
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.menu a');
    if (a) document.body.classList.remove('nav-open');
  });
  var NAMES = {
    ekip: 'Ekip kur, 8 kişi', sesli: 'Sesli ekip odası', boss: 'Boss alarmı', event: 'Event takvimi', bildirim: 'Telefon bildirimleri',
    kasa: 'Gelir–gider defteri', ticaret: 'Item ticareti ve drop payı', exp: 'EXP ve PUS hesabı', basma: 'Item basma simülatörü',
    gb: 'Canlı GB fiyatları', pazar: 'Canlı pazar', ilan: 'Site ilanları'
  };
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
