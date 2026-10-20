'use strict';
/* ==========================================================================
   KO Ekip — süperadmin "Üyeler" paneli, herkese duyuru ve "Hesabım" (veri indir / hesabı sil)
   • Üyeler: tüm kayıtlılar (kohesapAccess) canlı; istatistik, kayıt grafiği, arama,
     filtre, sıralama, CSV, VIP verme, erişim kaldırma
   • Duyuru: config/announce { on, text, level, id } → tüm üyelerin ekranında üst bant
   • Hesabım: tüm karakter kayıtlarını JSON indir; hesabı ve verileri kalıcı sil (KVKK)
   ========================================================================== */
ICON.uyeler = I('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/><path d="M16 4.5a3 3 0 0 1 0 6"/><path d="M18 14c1.6.6 2.7 2 3 5"/>');
(function addPage() {
  const i = PAGES.findIndex(p => p.id === 'internet');
  PAGES.splice(i < 0 ? PAGES.length : i, 0, { id: 'uyeler', t: 'Üyeler', d: 'Kayıtlı herkes, istatistikler, VIP ve duyurular (yalnızca admin)', admin: true });
})();
const MB = { q: '', f: 'all', sort: 'seen', n: 50 };
const DAY = 864e5;
const mbDate = t => t ? new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const mbVipUntil = u => +(u.vipUntil || 0);
function mbUsers() {
  const A = ACC.admin, list = [...(A.users || [])];
  const now = Date.now(), q = MB.q.trim().toLocaleLowerCase('tr');
  let l = list.filter(u => !q || `${u.name || ''} ${u.email || ''} ${(u.chars || []).map(c => c.name).join(' ')}`.toLocaleLowerCase('tr').includes(q));
  const F = {
    all: () => true,
    vip: u => mbVipUntil(u) > now,
    req: u => u.vipReq && !(mbVipUntil(u) > now),
    new: u => now - (u.at || 0) < 7 * DAY,
    act: u => now - (u.seen || 0) < 7 * DAY,
    idle: u => now - (u.seen || u.at || 0) > 30 * DAY,
  };
  l = l.filter(F[MB.f] || F.all);
  const S = { seen: (a, b) => (b.seen || b.at || 0) - (a.seen || a.at || 0), at: (a, b) => (b.at || 0) - (a.at || 0), name: (a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'tr'), lv: (a, b) => mbMaxLv(b) - mbMaxLv(a) };
  return l.sort(S[MB.sort] || S.seen);
}
const mbMaxLv = u => Math.max(0, ...(u.chars || []).map(c => +c.level || 0));
function mbStats() {
  const A = ACC.admin, us = A.users || [], now = Date.now();
  const vip = us.filter(u => mbVipUntil(u) > now && u.code !== 'admin');
  const days = Array.from({ length: 30 }, (_, i) => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const s = d0.getTime() - (29 - i) * DAY; return { s, n: us.filter(u => (u.at || 0) >= s && (u.at || 0) < s + DAY).length }; });
  return {
    total: us.length,
    day: us.filter(u => now - (u.at || 0) < DAY).length,
    week: us.filter(u => now - (u.at || 0) < 7 * DAY).length,
    active: us.filter(u => now - (u.seen || 0) < 7 * DAY).length,
    today: us.filter(u => now - (u.seen || 0) < DAY).length,
    vip: vip.length, vipReq: us.filter(u => u.vipReq && !(mbVipUntil(u) > now)).length,
    pending: (A.reqs || []).filter(r => !us.some(u => u.uid === r.uid)).length,
    chars: us.reduce((a, u) => a + (u.chars || []).length, 0),
    mrr: vip.length * (+(PLAN && PLAN.d.price) || 125), days,
  };
}
function mbView() {
  setTimeout(accessAdminLoad, 0);
  const st = mbStats(), list = mbUsers(), now = Date.now(), max = Math.max(1, ...st.days.map(d => d.n));
  const stat = (t, v, s, cls = '') => `<div class="callout ${cls}"><div class="hint">${t}</div><div class="big-result">${v}</div>${s ? `<div class="hint">${s}</div>` : ''}</div>`;
  const chip = (k, t, n) => `<button class="chip ${MB.f === k ? 'on' : ''}" data-act="mb-f" data-v="${k}">${t}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  const row = u => {
    const until = mbVipUntil(u), vip = until > now, isAdm = u.code === 'admin';
    const how = { admin: 'admin', onay: 'onayla', acik: 'açık kayıt' }[u.code] || (u.code ? 'davet kodu' : '—');
    const chars = (u.chars || []);
    return `<tr>
      <td><div class="mb-u">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : '<span class="mb-ph"></span>'}<div><b>${esc(u.name || '—')}${isAdm ? ' <span class="badge y">admin</span>' : ''}</b><span>${esc(u.email || '')}</span></div></div></td>
      <td>${mbDate(u.at)}<div class="hint">${esc(how)}</div></td>
      <td>${u.seen ? fmtAgo(u.seen) : '—'}</td>
      <td>${chars.length ? chars.map(c => `<span class="mb-c">${esc(c.name)} <b>${c.level}</b></span>`).join('') : '<span class="mut">—</span>'}</td>
      <td>${isAdm ? '<span class="badge y">süresiz</span>' : vip ? `<span class="badge y">VIP · ${daysLeft(until)} gün</span>` : u.vipReq ? '<span class="badge r">istiyor</span>' : '<span class="mut">üye</span>'}</td>
      <td class="mb-act">${isAdm ? '' : `<button class="btn sm" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="30">+30 gün</button>${vip ? `<button class="btn sm ghost" data-act="pl-vip" data-uid="${esc(u.uid)}" data-d="0">VIP kaldır</button>` : ''}<button class="btn sm ghost danger" data-act="acc-revoke" data-uid="${esc(u.uid)}" title="Erişimi kaldır">${ICON.del}</button>`}</td>
    </tr>`;
  };
  const ann = (typeof ANN !== "undefined" && ANN.d) || {};
  return `${ACC.admin.err ? `<div class="callout r" style="margin-bottom:12px">${esc(ACC.admin.err)}</div>` : ''}
  <div class="grid g4 mb-stats">
    ${stat('Toplam üye', fmtN(st.total), `bugün +${st.day} · bu hafta +${st.week}`)}
    ${stat('Aktif (7 gün)', fmtN(st.active), `bugün ${st.today} kişi girdi`)}
    ${stat('VIP', fmtN(st.vip), `${st.vipReq} istek bekliyor`, 'y')}
    ${stat('Tahmini aylık gelir', fmtTL(st.mrr), `${st.vip} VIP × ${esc(String(PLAN.d.price || 125))} TL · ödeme sistemi açılınca gerçek`)}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-h"><h3>Son 30 gün kayıt</h3><span class="sub">${st.days.reduce((a, d) => a + d.n, 0)} yeni üye · ${st.pending ? `<b style="color:var(--red)">${st.pending} onay bekliyor</b> (Ayarlar)` : 'onay bekleyen yok'} · ${fmtN(st.chars)} karakter</span></div>
    <div class="mb-chart">${st.days.map(d => `<div class="mb-bar" title="${new Date(d.s).toLocaleDateString('tr-TR')}: ${d.n} kayıt"><i style="height:${Math.round(d.n / max * 100)}%"></i></div>`).join('')}</div>
    <div class="mb-axis"><span>${new Date(st.days[0].s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span><span>bugün</span></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-h"><h3>Duyuru <span class="badge ${ann.on ? 'g' : ''}">${ann.on ? 'yayında' : 'kapalı'}</span></h3><span class="sub">Tüm üyelerin ekranında üstte görünür; kullanıcı kapatabilir</span></div>
    <div class="form"><label class="f full">Metin<input class="inp" id="mbAnn" data-fk="mbAnn" maxlength="220" value="${esc(ann.text || '')}" placeholder="örn. Yeni sunucular 12 Kasım 16:00'da açılıyor! Ön kaydını yap."></label>
      <label class="f">Tür<select class="inp" id="mbAnnLv">${[['info', 'Bilgi'], ['warn', 'Uyarı'], ['vip', 'VIP / kampanya']].map(([v, t]) => `<option value="${v}" ${ann.level === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn pri sm" data-act="mb-ann" data-on="1">Yayınla</button>${ann.on ? '<button class="btn sm ghost" data-act="mb-ann" data-on="0">Kaldır</button>' : ''}</div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-h"><h3>Tüm üyeler <span class="badge">${list.length}</span></h3>
      <div class="row" style="gap:8px"><select class="inp" data-act-change="mb-sort" id="mbSort" style="width:auto">${[['seen', 'Son giriş'], ['at', 'Kayıt tarihi'], ['lv', 'Seviye'], ['name', 'Ad']].map(([v, t]) => `<option value="${v}" ${MB.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn sm" data-act="mb-csv">${ICON.down || ''} CSV</button></div></div>
    <input class="inp" id="mbQ" data-fk="mbQ" placeholder="Ad, e-posta ya da karakter adı ara" value="${esc(MB.q)}" style="margin-bottom:10px">
    <div class="chips" style="margin-bottom:12px">${chip('all', 'Tümü', st.total)}${chip('act', 'Aktif (7 gün)', st.active)}${chip('new', 'Yeni (7 gün)', st.week)}${chip('vip', 'VIP', st.vip)}${chip('req', 'VIP isteyen', st.vipReq)}${chip('idle', '30 gün+ girmeyen')}</div>
    <div class="tbl-wrap"><table class="mb-tbl no-card"><thead><tr><th>Üye</th><th>Katılım</th><th>Son giriş</th><th>Karakterler</th><th>Üyelik</th><th></th></tr></thead>
    <tbody>${list.slice(0, MB.n).map(row).join('') || `<tr><td colspan="6" class="mut" style="padding:16px">${ACC.admin.loaded ? 'Bu filtrede üye yok.' : 'Yükleniyor…'}</td></tr>`}</tbody></table></div>
    ${list.length > MB.n ? `<div style="text-align:center;margin-top:10px"><button class="btn sm" data-act="mb-more">${list.length - MB.n} üye daha göster</button></div>` : ''}
    <div class="hint" style="margin-top:10px">Onay bekleyenler ve davet kodu: Ayarlar → Kullanıcılar ve onay. Fiyat ve özellik seçimleri: VIP Üyelik.</div>
  </div>`;
}
VIEWS.uyeler = () => isAdmin() ? mbView() : '';
// canlı güncelleme: admin listesi değişince bu sayfayı da yenile
const _repaintUsersM = repaintUsers;
repaintUsers = function () { _repaintUsersM(); if (ui.page === 'uyeler' && isAdmin() && !document.activeElement?.matches?.('#mbAnn')) render(); };

/* ---------- duyuru bandı (tüm üyeler) ---------- */
const ANN = { d: null, unsub: null };
function annWatch() {
  if (ANN.unsub || !CLOUD.db || !CLOUD.user) return;
  try { ANN.unsub = FB.onSnapshot(FB.doc(CLOUD.db, 'config', 'announce'), s => { ANN.d = s.exists() ? s.data() : null; MB.ann = ANN.d; if (CUR.ch) render(); }, () => { }); } catch { }
}
function annPaint() {
  const c = document.getElementById('content'); if (!c) return;
  const old = c.querySelector(':scope > .ann'); if (old) old.remove();
  const d = ANN.d; if (!d || !d.on || !d.text) return;
  let seen = ''; try { seen = localStorage.getItem('koekip.ann') || ''; } catch { }
  if (seen === String(d.id)) return;
  c.insertAdjacentHTML('afterbegin', `<div class="ann ${esc(d.level || 'info')}"><span>${d.level === 'warn' ? '⚠️' : d.level === 'vip' ? '👑' : '📢'}</span><p>${esc(d.text)}</p><button class="icon-btn" data-act="ann-x" title="Kapat">×</button></div>`);
}
const _renderM = render;
render = function () { const r = _renderM.apply(this, arguments); try { annWatch(); annPaint(); } catch { } return r; };

/* ---------- Hesabım: veri indir / hesabı sil (Ayarlar'ın sonunda) ---------- */
const _ayarM = VIEWS.ayar;
VIEWS.ayar = function () {
  const out = _ayarM.apply(this, arguments);
  if (!CLOUD.user) return out;
  return out + `<div class="card acc-card" style="margin-top:14px">
    <div class="card-h"><div><h3>Hesabım</h3><div class="sub">${esc(CLOUD.user.email || '')} · Google ile giriş</div></div></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn" data-act="me-export">${ICON.down || ''} Tüm verilerimi indir (JSON)</button>
      <a class="btn ghost" href="${(typeof IS_EXE !== 'undefined' && IS_EXE ? SITE : '')}/gizlilik" target="_blank" rel="noopener">Gizlilik ve KVKK</a>
      <a class="btn ghost" href="${(typeof IS_EXE !== 'undefined' && IS_EXE ? SITE : '')}/kullanim-sartlari" target="_blank" rel="noopener">Kullanım şartları</a>
      <a class="btn ghost" href="mailto:info@forgeandplay.com">Destek: info@forgeandplay.com</a>
    </div>
    ${isAdmin() ? '' : `<div class="acc-danger"><div><b>Hesabımı sil</b><span>Tüm karakterlerin, defter kayıtların, bildirim ayarların ve üyeliğin kalıcı olarak silinir; ekiplerden çıkarılırsın. Geri alınamaz.</span></div><button class="btn ghost danger" data-act="me-delete">Hesabımı sil</button></div>`}
  </div>`;
};
Object.assign(ACTIONS, {
  'mb-f': el => { MB.f = el.dataset.v; MB.n = 50; render(); },
  'mb-more': () => { MB.n += 100; render(); },
  'mb-csv': () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Ad', 'E-posta', 'Katılım', 'Yöntem', 'Son giriş', 'Karakterler', 'En yüksek seviye', 'VIP bitiş', 'VIP isteği']]
      .concat(mbUsers().map(u => [u.name, u.email, u.at ? new Date(u.at).toISOString() : '', u.code, u.seen ? new Date(u.seen).toISOString() : '', (u.chars || []).map(c => `${c.name} ${c.level}`).join(' | '), mbMaxLv(u) || '', mbVipUntil(u) ? new Date(mbVipUntil(u)).toISOString() : '', u.vipReq ? new Date(u.vipReq).toISOString() : '']));
    download(`koekip-uyeler-${localDate()}.csv`, '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  },
  'mb-ann': el => {
    const on = el.dataset.on === '1', text = String(($('#mbAnn') || {}).value || '').trim().slice(0, 220), level = ($('#mbAnnLv') || {}).value || 'info';
    if (on && !text) return toast('Duyuru metni yazın', 'err');
    FB.setDoc(FB.doc(CLOUD.db, 'config', 'announce'), on ? { on: true, text, level, id: Date.now(), by: CLOUD.user.email } : { on: false }, { merge: true })
      .then(() => toast(on ? 'Duyuru yayında: tüm üyeler görüyor' : 'Duyuru kaldırıldı', 'ok'))
      .catch(e => toast(e.message, 'err'));
  },
  'ann-x': () => { try { localStorage.setItem('koekip.ann', String(ANN.d && ANN.d.id)); } catch { } annPaint(); },
  'me-export': () => {
    const acc = CUR.acc || {};
    const out = { app: 'KO Ekip', at: new Date().toISOString(), user: { email: CLOUD.user.email, name: CLOUD.user.displayName }, shared: DB.shared, chars: (acc.chars || []).map(c => ({ ...c })) };
    download(`koekip-verilerim-${localDate()}.json`, JSON.stringify(out, null, 1), 'application/json');
  },
  'me-delete': () => {
    confirmBox('Hesabımı kalıcı olarak sil', `Bu işlem <b>geri alınamaz</b>. Önce "Tüm verilerimi indir" ile yedek almanı öneririz.<br><br>Onaylamak için kutuya <b>SİL</b> yaz:<br><input class="inp" id="meDelTxt" autocomplete="off" style="margin-top:8px">`, 'Hesabımı sil', async () => {
      if (String(($('#meDelTxt') || {}).value || '').trim().toLocaleUpperCase('tr') !== 'SİL') return toast('Onay için SİL yazmalısın', 'err');
      try {
        const base = typeof IS_EXE !== 'undefined' && IS_EXE ? siteBase() : '';
        const r = await (await authFetch(base + '/api/kohesap/account', { method: 'DELETE' })).json();
        if (!r.ok) throw new Error(r.error || 'silinemedi');
        try { ['koekip.in', 'koekip.name', 'koekip.photo'].forEach(k => localStorage.removeItem(k)); } catch { }
        toast('Hesabın ve tüm verilerin silindi. Görüşmek üzere!', 'ok');
        setTimeout(() => logout(), 800);
      } catch (e) { toast(e.message, 'err'); }
    });
  },
});
document.addEventListener('input', e => { if (e.target.id === 'mbQ') { MB.q = e.target.value; MB.n = 50; render(); } });
document.addEventListener('change', e => { if (e.target.id === 'mbSort') { MB.sort = e.target.value; render(); } });
