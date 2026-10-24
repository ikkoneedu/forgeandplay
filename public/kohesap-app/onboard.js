'use strict';
/* ==========================================================================
   BAŞLARKEN · panelin üstünde kısa kurulum listesi
   Yeni kullanıcıya uygulamanın en çok işe yarayan yerlerini tek tek gösterir.
   Adımlar kendiliğinden işaretlenir (veriden okunur); hepsi bitince ya da
   "Gizle" denince kaybolur (DB.shared.onbOff, hesapla birlikte kaydedilir).
   ========================================================================== */
function onbSteps() {
  const td = typeof todoOf === 'function' ? todoOf(CUR.ch) : null;
  const exe = typeof serverMode !== 'undefined' && serverMode;
  return [
    { id: 'gb', t: '1 GB fiyatını gir', d: 'Tüm noah tutarlarının TL karşılığı buna göre hesaplanır.', ok: S.settings.gbTL > 0, act: 'go', arg: 'ayar', b: 'Ayarlar' },
    { id: 'ekip', t: 'Ekibine katıl ya da ekip kur', d: 'Boss sayaçları, planlar ve sohbet ekiple paylaşılır.', ok: typeof TEAM !== 'undefined' && !!TEAM.code, act: 'go', arg: 'ekip', b: 'Ekip' },
    { id: 'push', t: 'Bildirimleri aç', d: 'Uygulama kapalıyken de event ve boss öncesi haber gelir.', ok: typeof pushHere === 'function' && pushHere(), act: 'go', arg: 'bildirim', b: 'Aç' },
    { id: 'app', t: exe ? 'Telefona da kur' : 'Ana ekrana ekle', d: exe ? 'Aynı hesapla telefondan da kullan.' : 'Uygulama gibi açılır, bildirimler daha güvenilir gelir.', ok: !exe && typeof isStandalone === 'function' && isStandalone(), act: 'go', arg: 'bildirim', b: 'Nasıl?' },
    { id: 'gun', t: 'Bugünün bir görevini işaretle', d: 'Günlük ve haftalık listeler sıfırlanma saatinde kendiliğinden temizlenir.', ok: !!(td && Object.keys(td.done).length), act: 'go', arg: 'gunluk', b: 'Görevler' },
    { id: 'tx', t: 'İlk defter kaydını gir', d: 'Kazancını ve harcamanı aylık özetle takip et.', ok: (S.tx || []).length > 0, act: 'onb-tx', b: 'Gelir ekle' },
  ];
}
function onbCard() {
  if (!CUR.ch || DB.shared.onbOff) return '';
  const st = onbSteps(), done = st.filter(x => x.ok).length;
  if (done === st.length) return '';
  const nx = st.find(x => !x.ok);
  return `<section class="card onb">
    <div class="onb-h"><div><h3>Başlarken</h3><span class="mut">${done}/${st.length} tamam · birkaç dakikada her şeyi hazırla</span></div>
      <button class="btn sm ghost" data-act="onb-off" title="Bu listeyi gizle">Gizle</button></div>
    <div class="onb-bar" aria-hidden="true"><i style="width:${Math.round(done / st.length * 100)}%"></i></div>
    <div class="onb-list">${st.map(x => `<div class="onb-it ${x.ok ? 'ok' : ''} ${x === nx ? 'nx' : ''}">
      <span class="onb-ck">${x.ok ? '✓' : ''}</span>
      <div class="onb-tx"><b>${esc(x.t)}</b><span class="mut">${esc(x.d)}</span></div>
      ${x.ok ? '' : `<button class="btn sm ${x === nx ? 'pri' : ''}" data-act="${x.act}"${x.arg ? ` data-id="${x.arg}"` : ''}>${esc(x.b)}</button>`}
    </div>`).join('')}</div>
  </section>`;
}
const _panelO = VIEWS.panel;
VIEWS.panel = () => onbCard() + _panelO();
Object.assign(ACTIONS, {
  'onb-off': () => { DB.shared.onbOff = true; save(); render(); toast('Başlarken listesi gizlendi', 'ok'); },
  'onb-tx': () => { ACTIONS.go({ dataset: { id: 'kasa' } }); ACTIONS['tx-add']({ dataset: { type: 'gelir' } }); },
});
