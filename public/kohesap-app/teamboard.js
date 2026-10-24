'use strict';
/* ==========================================================================
   EKİP DUYURUSU VE DISCORD KÖPRÜSÜ
   - Duyuru: lider sabit bir not yazar (kurallar, toplanma yeri, sesli oda saati…);
     Ekip ve Ses & Sohbet sayfalarının üstünde görünür.
       kohesapTeams/{kod}.pin = { t, by, at }
   - Discord: lider bir kanal webhook adresi girer; ekip planları ve "boss çıktı"
     duyuruları o kanala da gider. Adres gizli alt belgede, yalnızca lider ve sunucu görür.
       kohesapTeams/{kod}/private/discord = { url, plan, boss, at, by }
   ========================================================================== */
const TB = { dc: null, dcCode: '', dcErr: '', open: false };
const isTeamOwner = () => !!(TEAM.doc && TEAM.doc.owner === myUid());
const DC_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,100}$/;
const dcRef = () => FB.doc(CLOUD.db, 'kohesapTeams', TEAM.code, 'private', 'discord');

/* ---------- duyuru ---------- */
function pinBox() {
  if (!TEAM.doc) return '';
  const p = TEAM.doc.pin, own = isTeamOwner();
  if (!(p && p.t) && !own) return '';
  return `<section class="card tb-pin ${p && p.t ? '' : 'empty'}">
    <span class="tb-ic">📌</span>
    <div class="tb-body">${p && p.t ? `<div class="tb-t">${esc(p.t).replace(/\n/g, '<br>')}</div><span class="mut">${p.at ? 'Güncellendi ' + agoDay(new Date(p.at).toISOString()) : ''}</span>`
      : '<b>Ekip duyurusu yok</b><span class="mut">Kurallar, toplanma yeri, sesli oda saatleri… Ekipteki herkes bunu Ekip ve Sohbet sayfasının üstünde görür.</span>'}</div>
    ${own ? `<button class="btn sm ${p && p.t ? 'ghost' : ''}" data-act="tb-pin">${p && p.t ? 'Düzenle' : 'Duyuru yaz'}</button>` : ''}
  </section>`;
}
function pinForm() {
  const p = (TEAM.doc && TEAM.doc.pin) || {};
  openForm({
    title: 'Ekip duyurusu', data: { t: p.t || '' },
    fields: [{ k: 't', label: 'Duyuru (boş bırakırsan kaldırılır)', type: 'textarea', full: true }],
    onSave: v => {
      const t = String(v.t || '').trim().slice(0, 500);
      FB.setDoc(teamRef(TEAM.code), { pin: t ? { t, by: myUid(), at: Date.now() } : FB.deleteField(), updatedAt: FB.serverTimestamp() }, { merge: true })
        .then(() => { toast(t ? 'Duyuru kaydedildi' : 'Duyuru kaldırıldı', 'ok'); if (t && typeof botSay === 'function') botSay('📌 Ekip duyurusu güncellendi:\n' + t.slice(0, 400), 'pin').catch(() => { }); })
        .catch(e => toast(isPermErr(e) ? 'İzin yok' : e.message, 'err'));
    },
  });
}

/* ---------- discord ---------- */
async function dcLoad(force) {
  if (!isTeamOwner() || (!force && TB.dcCode === TEAM.code)) return;
  TB.dcCode = TEAM.code; TB.dc = null; TB.dcErr = '';
  try { const s = await FB.getDoc(dcRef()); TB.dc = s.exists() ? s.data() : {}; }
  catch (e) { TB.dcErr = isPermErr(e) ? 'Firebase kurallarının güncel hali yayınlanınca açılır.' : e.message; TB.dc = {}; }
  if (ui.page === 'ekip') render();
}
function dcCard() {
  if (!isTeamOwner()) return '';
  setTimeout(() => dcLoad(), 0);
  const c = TB.dc, on = !!(c && c.url);
  return `<details class="card tb-dc" ${TB.open ? 'open' : ''} data-tb-dc>
    <summary><span class="tb-dcl">${DC_ICON}<b>Discord bağlantısı</b></span><span class="badge ${on ? 'g' : ''}">${c == null ? '…' : on ? 'bağlı' : 'bağlı değil'}</span></summary>
    <p class="mut">Ekip planları ve "📣 Çıktı" duyuruları ekibinin Discord kanalına da düşsün. Discord'da kanal ayarları → <b>Entegrasyonlar → Webhook'lar → Yeni webhook</b> → <b>Webhook URL'sini kopyala</b>, buraya yapıştır. Adresi yalnızca sen ve sunucu görürsün.</p>
    ${TB.dcErr ? `<div class="callout r">${esc(TB.dcErr)}</div>` : ''}
    <div class="form">
      <label class="f full">Webhook adresi<input class="inp" id="dcUrl" value="${esc((c && c.url) || '')}" placeholder="https://discord.com/api/webhooks/…" autocomplete="off" spellcheck="false"></label>
      <label class="check"><input type="checkbox" id="dcPlan" ${!c || c.plan !== false ? 'checked' : ''}> Ekip planları</label>
      <label class="check"><input type="checkbox" id="dcBoss" ${!c || c.boss !== false ? 'checked' : ''}> Boss çıktı duyuruları</label>
    </div>
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn pri sm" data-act="dc-save">Kaydet</button>
      ${on ? '<button class="btn sm" data-act="dc-test">Deneme mesajı</button><button class="btn sm ghost danger" data-act="dc-del">Bağlantıyı kaldır</button>' : ''}
    </div>
  </details>`;
}
const DC_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.8a16.7 16.7 0 0 0 5 2.5l1.1-1.7c-.6-.2-1.2-.5-1.8-.9l.4-.3a11.9 11.9 0 0 0 11.8 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.7a16.7 16.7 0 0 0 5-2.5c.4-4.4-.7-8.2-3-11.5zM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>';

Object.assign(ACTIONS, {
  'tb-pin': () => pinForm(),
  'dc-save': () => {
    const url = ($('#dcUrl') || {}).value.trim();
    if (!DC_RE.test(url)) return toast('Bu bir Discord webhook adresi değil (https://discord.com/api/webhooks/… olmalı)', 'err');
    const d = { url, plan: !!($('#dcPlan') || {}).checked, boss: !!($('#dcBoss') || {}).checked, at: Date.now(), by: myUid() };
    FB.setDoc(dcRef(), d).then(() => { TB.dc = d; TB.open = true; toast('Discord bağlandı · deneme mesajı gönderiliyor', 'ok'); render(); ACTIONS['dc-test'](); })
      .catch(e => toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'));
  },
  'dc-test': async () => {
    try { const j = await apiPost('/api/koekip/push/team', { type: 'discord', team: TEAM.code }); toast(j.ok ? 'Discord kanalına deneme mesajı gitti' : 'Mesaj gitmedi; adresi kontrol et', j.ok ? 'ok' : 'err'); }
    catch (e) { toast('Gönderilemedi: ' + e.message, 'err'); }
  },
  'dc-del': () => confirmBox('Discord bağlantısını kaldır', 'Bildirimler artık Discord kanalına gitmeyecek.', 'Kaldır', () =>
    FB.deleteDoc(dcRef()).then(() => { TB.dc = {}; toast('Bağlantı kaldırıldı', 'ok'); render(); }).catch(e => toast(e.message, 'err'))),
});
document.addEventListener('toggle', e => { if (e.target && e.target.dataset && e.target.dataset.tbDc != null) TB.open = e.target.open; }, true);

/* sayfalara ekle */
const _ekipTB = VIEWS.ekip;
VIEWS.ekip = function () { const html = _ekipTB.apply(this, arguments); return TEAM.doc ? pinBox() + html + dcCard() : html; };
const _sesTB = VIEWS.ses;
VIEWS.ses = function () { const html = _sesTB.apply(this, arguments); return TEAM.doc && TEAM.doc.pin && TEAM.doc.pin.t ? pinBox() + html : html; };
