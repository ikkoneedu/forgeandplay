'use strict';
/* ==========================================================================
   ITEM BASMA · TOPLULUK ORANLARI
   İsteyen kullanıcı gerçek basma günlüğünün yalnızca sayılarını paylaşır
   (scroll + adım başına deneme / geçti; item adı ve kimlik yok). Paylaşanların
   toplamı "Gerçekleşen oranlar" tablosunda "Topluluk" sütunu olarak görünür.
   Varsayılan kapalı (KVKK: açık rıza); kapatınca paylaşılan sayılar silinir.
     kohesapAnvil/{uid} → { s: { 'bus|5': [deneme, geçti], … }, at }
   ========================================================================== */
const ACM = { data: null, at: 0, busy: false, lastSig: '' };
const acOn = () => !!(anv().share);
const acRef = () => FB.doc(CLOUD.db, 'kohesapAnvil', myUid());
/** kendi günlüğünden paylaşılacak özet */
function acMine() {
  const s = {};
  anvStats().forEach(x => { if (x.n > 0 && ANV_SCROLLS[x.scroll] && x.lv >= 1 && x.lv <= 11) s[x.scroll + '|' + x.lv] = [Math.min(x.n, 100000), Math.min(x.ok, x.n)]; });
  return s;
}
async function acPush(force) {
  if (!acOn() || !CLOUD.db || !myUid()) return;
  const s = acMine(), sig = JSON.stringify(s);
  if (!force && sig === ACM.lastSig) return;
  ACM.lastSig = sig;
  try { await FB.setDoc(acRef(), { s, at: Date.now() }); }
  catch (e) { console.warn('topluluk oranı', e); }
}
/** topluluk toplamı (10 dakikada bir okunur) */
async function acLoad(force) {
  if (ACM.busy || !CLOUD.db || (!force && ACM.data && Date.now() - ACM.at < 10 * 60e3)) return;
  ACM.busy = true;
  try {
    const qs = await FB.getDocs(FB.query(FB.collection(CLOUD.db, 'kohesapAnvil'), FB.orderBy('at'), FB.limitToLast(500)));
    const sum = {}; let people = 0;
    qs.docs.forEach(d => {
      const s = (d.data() || {}).s || {}; let any = false;
      for (const [k, v] of Object.entries(s)) {
        if (!Array.isArray(v) || !(v[0] > 0) || v[1] < 0 || v[1] > v[0]) continue;
        const t = sum[k] || (sum[k] = [0, 0]); t[0] += v[0]; t[1] += v[1]; any = true;
      }
      if (any) people++;
    });
    ACM.data = { sum, people }; ACM.at = Date.now();
  } catch (e) { ACM.data = ACM.data || { sum: {}, people: 0, err: isPermErr(e) ? 'kurallar' : e.message }; }
  ACM.busy = false;
  if (ui.page === 'basma' && $('#modalBack').hidden) render();
}

/* ---------- görünüm: "Gerçekleşen oranlar" tablosuna Topluluk sütunu ---------- */
function acCell(scroll, lv) {
  const t = ACM.data && ACM.data.sum[scroll + '|' + lv];
  if (!t || t[0] < 5) return '<span class="mut">—</span>';
  return `<b>%${fmtX(Math.round(t[1] / t[0] * 1000) / 10)}</b><div class="hint">${fmtN(t[0])} deneme</div>`;
}
const _anvLogViewC = anvLogView;
anvLogView = function () {
  setTimeout(() => acLoad(), 0);
  if (acOn()) setTimeout(() => acPush(), 0);
  let html = _anvLogViewC.apply(this, arguments);
  // başlık ve satırlara sütun ekle
  html = html.replace('<th class="num">Tablo</th></tr>', '<th class="num">Tablo</th><th class="num" title="Paylaşan oyuncuların toplamı">Topluluk</th></tr>');
  anvStats().forEach(s => {
    const label = `<td>+${s.lv} → +${s.lv + 1}</td>`;
    // satırın sonuna (Tablo hücresinden sonra) topluluk hücresi
    const re = new RegExp(`(<tr><td>${esc((ANV_SCROLLS[s.scroll] || {}).t || s.scroll).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</td>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)</tr>`);
    html = html.replace(re, `$1<td class="num">${acCell(s.scroll, s.lv)}</td></tr>`);
  });
  const people = ACM.data ? ACM.data.people : 0;
  const box = `<div class="ac-box">
    <label class="check"><input type="checkbox" data-ac-share ${acOn() ? 'checked' : ''}> Basma sayılarımı topluluk oranlarına anonim olarak ekle</label>
    <span class="hint">Yalnızca scroll ve adım başına deneme / geçti sayısı paylaşılır; item adı ve kimliğin paylaşılmaz. Kapatınca paylaşılanlar silinir.${people ? ` · Şu an ${people} oyuncu katkıda bulunuyor.` : ''}</span>
  </div>`;
  return html.replace('<div class="hint" style="margin-top:8px">Az denemede', box + '<div class="hint" style="margin-top:8px">Az denemede');
};
document.addEventListener('change', e => {
  if (!e.target.dataset || e.target.dataset.acShare == null) return;
  const on = e.target.checked;
  anv().share = on; save();
  if (on) { ACM.lastSig = ''; acPush(true).then(() => acLoad(true)); toast('Teşekkürler · sayıların topluluk oranlarına eklendi', 'ok'); }
  else { FB.deleteDoc(acRef()).catch(() => { }); ACM.lastSig = ''; toast('Paylaşım kapatıldı · sayıların silindi', 'ok'); setTimeout(() => acLoad(true), 500); }
  render();
});
