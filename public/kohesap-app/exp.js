'use strict';
/* ==========================================================================
   KO Ekip — EXP planlayıcı
   Seviye aralığı (ör. 30 %0 → 83 %0), seviye aralıklarına göre saatlik EXP,
   günde oynanan saat → toplam süre, bitiş tarihi, seviye seviye döküm;
   Genie (Spirit of Genie), Genie Hammer, slot / leveling ücreti ve elektrik
   maliyeti (TL + GB).
   ========================================================================== */
const XP_MAX_LV = 83;
const XP_DEF = {
  fromLv: 30, fromPct: 0, toLv: 83, toPct: 0, bonus: 0, hpd: 8,
  segs: [{ lv: 30, rate: '' }],
  genie: true, genieH: 2, hammerH: 4,
  slotAmt: '', slotUnit: 'gb', slotBasis: 'saat',
  pc: true, watt: 300, kwh: 3.5,
  otherAmt: '', otherUnit: 'noah',
};
function xpCalc() {
  const c = S.exp.calc;
  for (const [k, v] of Object.entries(XP_DEF)) if (c[k] === undefined) c[k] = Array.isArray(v) ? v.map(x => ({ ...x })) : v;
  if (!Array.isArray(c.segs) || !c.segs.length) c.segs = [{ lv: c.fromLv || 1, rate: '' }];
  return c;
}
const xpNeed = lv => (S.exp.table && S.exp.table[lv]) || EXP_REQ[lv - 1] || 0;
/** PUS kataloğundan birim KC fiyatı: "Spirit of Genie (10 adet)" → 14,9 KC */
function pusUnitKC(re, fallbackKC, fallbackQty = 1) {
  const it = (S.pus.catalog || []).find(x => re.test(x.name));
  if (!it) return fallbackKC / fallbackQty;
  const q = +((it.name.match(/\((\d+)\s*adet\)/i) || [])[1] || 1);
  return it.kc / q;
}

/** Saf hesap (test edilebilir): plan(c, need(lv), rateOf) */
function xpPlan(c, need) {
  const fromLv = clamp(Math.round(parseNum(c.fromLv)) || 1, 1, XP_MAX_LV);
  const toLv = clamp(Math.round(parseNum(c.toLv)) || fromLv, fromLv, XP_MAX_LV);
  const fromPct = clamp(parseNum(c.fromPct), 0, 100), toPct = clamp(parseNum(c.toPct), 0, 100);
  const mult = 1 + parseNum(c.bonus) / 100;
  const segs = (c.segs || []).map(s => ({ lv: Math.round(parseNum(s.lv)) || 1, rate: parseAmt(s.rate) })).filter(s => s.rate > 0).sort((a, b) => a.lv - b.lv);
  const rateAt = lv => { let r = segs.length ? segs[0].rate : 0; for (const s of segs) if (s.lv <= lv) r = s.rate; return r * mult; };
  const rows = []; let total = 0, hours = 0, missingRate = false;
  for (let lv = fromLv; lv <= toLv; lv++) {
    const n = need(lv);
    const a = lv === fromLv ? fromPct : 0;
    const b = lv === toLv ? (fromLv === toLv ? Math.max(toPct, a) : toPct) : 100;
    if (b <= a) continue;
    const exp = n * (b - a) / 100, r = rateAt(lv);
    const h = r > 0 ? exp / r : 0;
    if (!r) missingRate = true;
    total += exp; hours += h;
    rows.push({ lv, need: n, a, b, exp, rate: r, h, cum: hours });
  }
  return { fromLv, toLv, fromPct, toPct, rows, total, hours, missingRate, mult };
}
function xpCosts(c, hours) {
  const k = kcTL(), gbTL = S.settings.gbTL || 0, noahGB = S.settings.gbNoah || 1e8;
  const toTL = (amt, unit) => unit === 'tl' ? amt : unit === 'gb' ? (gbTL ? amt * gbTL : null) : unit === 'noah' ? (gbTL ? amt / noahGB * gbTL : null) : null;
  const out = [];
  if (c.genie) {
    const n = Math.ceil(hours / Math.max(0.1, parseNum(c.genieH) || 2)), kc = n * pusUnitKC(/spirit of genie/i, 149, 10);
    out.push({ k: 'genie', t: 'Spirit of Genie', q: `${fmtN(n)} adet`, sub: `${fmtX(parseNum(c.genieH) || 2)} saatte 1 · ${fmtX(kc)} KC`, tl: kc * k });
    const hm = Math.ceil(hours / Math.max(0.1, parseNum(c.hammerH) || 4)), hkc = hm * pusUnitKC(/genie hammer/i, 99);
    out.push({ k: 'hammer', t: 'Genie Hammer', q: `${fmtN(hm)} adet`, sub: `${fmtX(parseNum(c.hammerH) || 4)} saatte 1 · ${fmtX(hkc)} KC`, tl: hkc * k });
  }
  const sa = c.slotUnit === 'tl' ? parseNum(c.slotAmt) : c.slotUnit === 'gb' ? parseNum(c.slotAmt) : parseAmt(c.slotAmt);
  if (sa > 0) {
    const amt = c.slotBasis === 'saat' ? sa * hours : sa;
    const unitTxt = c.slotUnit === 'tl' ? fmtTL(amt) : c.slotUnit === 'gb' ? nf2.format(amt) + ' GB' : fmtShort(amt) + ' noah';
    out.push({ k: 'slot', t: 'Slot / leveling ücreti', q: unitTxt, sub: c.slotBasis === 'saat' ? `saatlik ${c.slotUnit === 'tl' ? fmtTL(sa) : c.slotUnit === 'gb' ? nf2.format(sa) + ' GB' : fmtShort(sa)} × ${fmtX(hours)} sa` : 'toplam (sabit)', tl: toTL(amt, c.slotUnit) });
  }
  if (c.pc) {
    const kwhUsed = (parseNum(c.watt) || 0) / 1000 * hours;
    out.push({ k: 'elec', t: 'Elektrik', q: `${nf2.format(kwhUsed)} kWh`, sub: `${fmtN(parseNum(c.watt) || 0)} W × ${fmtX(hours)} sa × ₺${nf2.format(parseNum(c.kwh) || 0)}/kWh`, tl: kwhUsed * (parseNum(c.kwh) || 0) });
  }
  const oa = c.otherUnit === 'tl' ? parseNum(c.otherAmt) : parseAmt(c.otherAmt);
  if (oa > 0) { const amt = oa * hours; out.push({ k: 'other', t: 'Diğer saatlik gider', q: c.otherUnit === 'tl' ? fmtTL(amt) : fmtShort(amt) + ' noah', sub: 'pot, scroll vb. × saat', tl: toTL(amt, c.otherUnit) }); }
  const tl = out.reduce((a, x) => a + (x.tl || 0), 0);
  return { list: out, tl, gb: gbTL ? tl / gbTL : null, unknown: out.some(x => x.tl == null) };
}
const xpDate = h => { const d = new Date(Date.now() + h * 3600e3); return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };

VIEWS.exp = () => {
  const c = xpCalc();
  const P = xpPlan(c, xpNeed);
  const hpd = clamp(parseNum(c.hpd) || 24, 0.5, 24);
  const days = P.hours / hpd;
  const C = xpCosts(c, P.hours);
  const inp = (k, ph, cls = 'num', extra = '') => `<input class="inp ${cls}" data-fk="xp-${k}" data-xp="${k}" value="${esc(c[k] ?? '')}" placeholder="${esc(ph || '')}" ${extra}>`;
  const sel = (k, opts) => `<select class="inp" data-xp="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(c[k]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (k, l) => `<label class="check"><input type="checkbox" data-xpc="${k}" ${c[k] ? 'checked' : ''}> ${l}</label>`;
  const segRows = c.segs.map((s, i) => `<div class="xp-seg">
      <label class="f">Seviyeden itibaren<input class="inp num" data-fk="xs-lv-${i}" data-xseg="${i}" data-xsf="lv" value="${esc(s.lv)}"></label>
      <label class="f">Saatlik EXP<input class="inp num" data-fk="xs-r-${i}" data-xseg="${i}" data-xsf="rate" value="${esc(s.rate)}" placeholder="örn. 150m"><span class="hint">${parseAmt(s.rate) ? fmtShort(parseAmt(s.rate)) + ' / saat' + (P.mult !== 1 ? ' → bonusla ' + fmtShort(parseAmt(s.rate) * P.mult) : '') : 'm = milyon, b = milyar'}</span></label>
      ${c.segs.length > 1 ? `<button class="icon-btn" data-act="xp-seg-del" data-i="${i}" title="Aralığı sil">${ICON.del}</button>` : '<span></span>'}
    </div>`).join('');
  const pct = P.total ? 100 : 0;
  const gbTxt = v => v == null ? '' : ' · ' + nf2.format(v) + ' GB';
  const meas = xpMeasured();
  return `
  <div class="grid g-wide xp">
    <div class="stack">
      <div class="card">
        <div class="card-h"><h3>Seviye aralığı</h3><span class="sub">Lv ${P.fromLv} %${fmtX(P.fromPct)} → Lv ${P.toLv} %${fmtX(P.toPct)}</span></div>
        <div class="form xp-range">
          <label class="f">Şu anki seviye${inp('fromLv', '30')}</label>
          <label class="f">Şu anki %${inp('fromPct', '0')}</label>
          <label class="f">Hedef seviye${inp('toLv', '83')}<span class="hint">en fazla ${XP_MAX_LV}</span></label>
          <label class="f">Hedef seviyede %${inp('toPct', '0')}<span class="hint">0 = o seviyeye ulaşınca</span></label>
          <label class="f">Toplam bonus %${inp('bonus', '0')}<span class="hint">premium, flash, scroll…</span></label>
          <label class="f">Günde kaç saat açık${inp('hpd', '8')}<span class="hint">7/24 için 24</span></label>
        </div>
        <div class="xp-sub-h"><b>Saatlik EXP</b><span class="mut">Kendi hızını yaz ya da aşağıdaki <b>Mob verisiyle saatlik EXP</b> kartından gerçek mob değerleriyle doldur</span></div>
        ${segRows}
        <div class="row" style="gap:8px;margin-top:6px">
          <button class="btn sm" data-act="xp-seg-add">${ICON.plus} Aralık ekle</button>
          ${meas ? `<button class="btn sm ghost" data-act="xp-use-meas" title="Oturum kayıtlarından ölçülen hız">Ölçülen hızı kullan (${fmtShort(meas.eh)}/saat · Lv ${meas.lv})</button>` : ''}
        </div>
        <div class="grid g4 xp-res">
          <div class="callout"><div class="hint">Toplam gereken EXP</div><div class="big-result">${P.total ? fmtShort(P.total) : '—'}</div><div class="hint">${P.rows.length} seviye</div></div>
          <div class="callout y"><div class="hint">Toplam süre</div><div class="big-result gold">${P.hours ? fmtDur(P.hours) : '—'}</div><div class="hint">${P.hours ? fmtX(P.hours) + ' saat oyun' : 'saatlik EXP girin'}</div></div>
          <div class="callout"><div class="hint">Günde ${fmtX(hpd)} saatle</div><div class="big-result">${P.hours ? (days < 1 ? fmtDur(P.hours) : fmtX(Math.ceil(days * 10) / 10) + ' gün') : '—'}</div><div class="hint">${P.hours ? 'bitiş ~ ' + xpDate(days * 24) : ''}</div></div>
          <div class="callout"><div class="hint">Toplam maliyet</div><div class="big-result">${P.hours && C.list.length ? fmtTL(C.tl) : '—'}</div><div class="hint">${P.hours && C.gb != null ? nf2.format(C.gb) + ' GB' : ''}${C.unknown ? ' · GB fiyatı girilmemiş' : ''}</div></div>
        </div>
        ${P.missingRate ? '<div class="callout" style="margin-top:10px">Bazı seviyeler için saatlik EXP yok; o seviyeler süreye eklenmedi.</div>' : ''}
      </div>

      ${xpMobCard(c, P)}

      <div class="card">
        <div class="card-h"><h3>Maliyet</h3><span class="sub">${P.hours ? fmtX(P.hours) + ' saat için' : 'süre hesaplanınca dolar'}</span></div>
        <div class="xp-cost-set">
          <div class="xp-cs">${chk('genie', '<b>Genie</b> kullanıyorum')}
            <div class="form xp-mini ${c.genie ? '' : 'off'}">
              <label class="f">1 Spirit of Genie kaç saat${inp('genieH', '2')}<span class="hint">10'lu paket = 20 saat</span></label>
              <label class="f">Genie Hammer kaç saatte 1${inp('hammerH', '4')}<span class="hint">kendi kullanımına göre</span></label>
            </div>
            <div class="hint">Fiyatlar PUS listenden: Spirit ${fmtX(pusUnitKC(/spirit of genie/i, 149, 10))} KC/adet · Hammer ${fmtX(pusUnitKC(/genie hammer/i, 99))} KC · 1 KC = ${fmtTL(kcTL())}</div>
          </div>
          <div class="xp-cs"><b>Slot / leveling ücreti</b>
            <div class="form xp-mini">
              <label class="f">Tutar${inp('slotAmt', c.slotUnit === 'tl' ? 'örn. 50' : c.slotUnit === 'gb' ? 'örn. 2' : 'örn. 150m')}</label>
              <label class="f">Birim${sel('slotUnit', [['gb', 'GB'], ['tl', 'TL'], ['noah', 'Noah']])}</label>
              <label class="f">Hesap${sel('slotBasis', [['saat', 'saat başı'], ['toplam', 'toplam']])}</label>
            </div>
          </div>
          <div class="xp-cs">${chk('pc', '<b>Bilgisayar</b> açık kalıyor (elektrik)')}
            <div class="form xp-mini ${c.pc ? '' : 'off'}">
              <label class="f">Güç (Watt)${inp('watt', '300')}<span class="hint">kasa + monitör; oyunda ~250–450 W</span></label>
              <label class="f">kWh fiyatı (TL)${inp('kwh', '3,5')}<span class="hint">faturandaki vergili birim fiyat</span></label>
            </div>
          </div>
          <div class="xp-cs"><b>Diğer saatlik gider</b>
            <div class="form xp-mini">
              <label class="f">Saatte${inp('otherAmt', c.otherUnit === 'tl' ? 'örn. 5' : 'örn. 3m')}</label>
              <label class="f">Birim${sel('otherUnit', [['noah', 'Noah'], ['tl', 'TL']])}</label>
            </div>
          </div>
        </div>
        ${P.hours && C.list.length ? `<div class="tbl-wrap" style="margin-top:12px"><table class="xp-ctbl"><thead><tr><th>Kalem</th><th class="num">Tutar</th></tr></thead><tbody>
          ${C.list.map(x => `<tr><td><b>${esc(x.t)}</b> <span class="mut">· ${esc(x.q)}</span><div class="hint">${esc(x.sub)}</div></td><td class="num"><b>${x.tl == null ? '—' : fmtTL(x.tl)}</b><div class="hint">${x.tl != null && S.settings.gbTL ? nf2.format(x.tl / S.settings.gbTL) + ' GB' : ''}</div></td></tr>`).join('')}
          <tr class="xp-tot"><td><b>Toplam</b></td><td class="num"><b class="gold">${fmtTL(C.tl)}</b><div class="hint">${C.gb != null ? nf2.format(C.gb) + ' GB' : 'GB fiyatı yok'}</div></td></tr>
          ${P.total ? `<tr><td colspan="2" class="hint">1 milyar EXP maliyeti: ${fmtTL(C.tl / P.total * 1e9)}${gbTxt(C.gb != null ? C.gb / P.total * 1e9 : null)} · günlük: ${fmtTL(C.tl / Math.max(days, 1 / 24))}</td></tr>` : ''}
        </tbody></table></div>` : ''}
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-h"><h3>Seviye seviye</h3><span class="sub">${P.rows.length ? fmtShort(P.total) + ' EXP' : ''}</span></div>
        ${P.rows.length ? `<div class="tbl-wrap" style="max-height:520px"><table class="xp-tbl"><thead><tr><th>Lv</th><th class="num">Gereken</th><th class="num">Süre</th><th class="num">Biter</th></tr></thead><tbody>
          ${P.rows.map(r => `<tr><td><b>${r.lv}</b>${r.a || r.b < 100 ? `<div class="hint">%${fmtX(r.a)}→%${fmtX(r.b)}</div>` : ''}</td><td class="num">${fmtShort(r.exp)}<div class="hint">${r.rate ? fmtShort(r.rate) + '/sa' : 'hız yok'}</div></td><td class="num">${fmtDur(r.h)}</td><td class="num gold">${r.rate ? Math.max(1, Math.ceil(r.cum / hpd - 1e-9)) + '. gün' : '—'}</td></tr>`).join('')}
        </tbody></table></div><div class="hint" style="margin-top:8px">“Biter”: günde ${fmtX(hpd)} saat oynarsan o seviyenin kaçıncı gün biteceği. EXP değerleri oyunun seviye tablosundan.</div>` : empty('Aralık seçin')}
      </div>
      ${xpSessionsCard()}
    </div>
  </div>`;
};
/* ---------- gerçek mob verisi + sunucu formülü ile saatlik EXP ----------
   Mob EXP'si: oyunun sunucu veritabanı (xpmobs.js). Formül: açık kaynak KO sunucusu
   (CUser::RecvUserExp, CNpc::GetRewardModifier / GetPartyRewardModifier):
   solo  → mobEXP × seviye farkı çarpanı (mob, senden 2–7 düşük 0,8 · 8–13 düşük 0,5 · 14+ düşük 0,2)
   parti → mobEXP × parti çarpanı (mob ort. seviyeden 2+ yüksek 1,2 · 5+ 1,5 · 8+ 2,0)
           × (1 + 0,3 × (kişi − 1)) × senin seviyen / toplam parti seviyesi
   Sonra premium / scroll / etkinlik bonusları (Toplam bonus %). */
function xpSoloMod(mobLv, lv) { const d = mobLv - lv; return d <= -14 ? 0.2 : d <= -8 ? 0.5 : d <= -2 ? 0.8 : 1; }
function xpPartyMod(mobLv, avg) { const d = mobLv - avg; return d >= 8 ? 2 : d >= 5 ? 1.5 : d >= 2 ? 1.2 : 1; }
function xpPerKill(mob, lv, n, avg) {
  if (!mob) return null;
  const [, mlv, exp] = mob;
  if (n <= 1) { const m = xpSoloMod(mlv, lv); return { exp: exp * m, steps: [`Mob EXP ${fmtN(exp)}`, `seviye farkı ${mlv - lv >= 0 ? '+' : ''}${mlv - lv} → ×${nf2.format(m)}`] }; }
  const pm = xpPartyMod(mlv, avg), share = (1 + 0.3 * (n - 1)) * lv / (n * avg);
  return { exp: exp * pm * share, steps: [`Mob EXP ${fmtN(exp)}`, `parti çarpanı ×${nf2.format(pm)}`, `${n} kişi: ×${nf2.format(1 + 0.3 * (n - 1))} · payın ${fmtN(lv)}/${fmtN(Math.round(n * avg))} seviye`] };
}
/** kesim hızı: hasarın varsa mobun gerçek HP'sinden, yoksa "dakikada mob" girişinden */
function xpKpm(c, mob, n) {
  const dmg = parseNum(c.dmg), hps = parseNum(c.hps || '1') || 1, gap = Math.max(0, parseNum(c.gap ?? '') || (c.gap === '0' ? 0 : 3));
  if (dmg > 0 && mob) { const sec = mob[3] / (dmg * hps * Math.max(1, n)) + gap; return { kpm: 60 / sec, sec, auto: true }; }
  const k = Math.max(0, parseNum(c.kpm || '2')); return { kpm: k, sec: k ? 60 / k : 0, auto: false };
}
/** seviyene yakın moblar içinde dakikada en çok EXP veren (hasarın girildiyse HP'ye göre) */
function xpBestMob(c, lv, n, avg) {
  for (const w of [4, 8, 14]) {
    const l = XPMOBS.filter(m => Math.abs(m[1] - lv) <= w && m[3] > 150);
    if (l.length) return l.map(m => [m, (xpPerKill(m, lv, n, avg) || { exp: 0 }).exp * xpKpm(c, m, n).kpm]).sort((a, b) => b[1] - a[1])[0][0];
  }
  return XPMOBS[0];
}
function xpMobCard(c) {
  if (typeof XPMOBS === 'undefined') return '';
  const lv = clamp(Math.round(parseNum(c.mobLv)) || Math.round(parseNum(c.fromLv)) || 1, 1, XP_MAX_LV);
  const n = clamp(Math.round(parseNum(c.party)) || 1, 1, 8), avg = n > 1 ? clamp(parseNum(c.pavg) || lv, 1, 90) : lv;
  const near = XPMOBS.filter(m => m[1] >= lv - 14 && m[1] <= lv + 12);
  const list = near.length ? near : XPMOBS;
  const mob = list.find(m => m[0] === c.mob) || xpBestMob(c, lv, n, avg);
  const K = xpKpm(c, mob, n), kpm = K.kpm;
  const pk = xpPerKill(mob, lv, n, avg), perH = pk ? pk.exp * kpm * 60 : 0, mult = 1 + parseNum(c.bonus) / 100;
  const need = xpNeed(lv);
  const opt = m => `<option value="${esc(m[0])}" ${m === mob ? 'selected' : ''}>Lv ${m[1]} · ${esc(m[0])} · ${fmtShort(m[2])} EXP · ${fmtShort(m[3])} HP${m[4] ? ' · ' + esc(m[4]) : ''}</option>`;
  return `<div class="card xp-mob">
    <div class="card-h"><div><h3>Mob verisiyle saatlik EXP <span class="badge g">gerçek veri</span></h3><div class="sub">Oyunun mob tablosu ve sunucunun EXP formülüyle hesaplanır; tahmin yerine bunu kullan.</div></div></div>
    <div class="form xp-range">
      <label class="f">Senin seviyen<input class="inp num" data-fk="xp-mobLv" data-xp="mobLv" value="${esc(c.mobLv ?? '')}" placeholder="${lv}"></label>
      <label class="f" style="grid-column:span 2">Kestiğin mob<select class="inp" data-xp="mob">${list.map(opt).join('')}</select><span class="hint">Seviyene yakın ${list.length} mob · ${c.mob ? 'seçimin' : 'dakikada en çok EXP veren varsayılan'}</span></label>
      <label class="f">Vuruş başına hasarın<input class="inp num" data-fk="xp-dmg" data-xp="dmg" value="${esc(c.dmg ?? '')}" placeholder="örn. 1800"><span class="hint">oyunda mobun üstünde çıkan sayı</span></label>
      <label class="f">Saniyede vuruş<input class="inp num" data-fk="xp-hps" data-xp="hps" value="${esc(c.hps ?? '')}" placeholder="1"><span class="hint">skill + normal vuruş ortalaması</span></label>
      <label class="f">Mob arası (sn)<input class="inp num" data-fk="xp-gap" data-xp="gap" value="${esc(c.gap ?? '')}" placeholder="3"><span class="hint">yürüme, toplama, pot</span></label>
      ${parseNum(c.dmg) > 0 ? '' : `<label class="f">ya da dakikada kaç mob<input class="inp num" data-fk="xp-kpm" data-xp="kpm" value="${esc(c.kpm ?? '')}" placeholder="2"><span class="hint">hasarını bilmiyorsan</span></label>`}
      <label class="f">Parti kişi sayısı<input class="inp num" data-fk="xp-party" data-xp="party" value="${esc(c.party ?? '')}" placeholder="1 = solo"></label>
      ${n > 1 ? `<label class="f">Parti ortalama seviye<input class="inp num" data-fk="xp-pavg" data-xp="pavg" value="${esc(c.pavg ?? '')}" placeholder="${lv}"></label>` : ''}
    </div>
    ${pk ? `<div class="grid g3 xp-res" style="margin-top:12px">
      <div class="callout"><div class="hint">Öldürme başına</div><div class="big-result">${fmtShort(pk.exp * mult)}</div><div class="hint">${pk.steps.map(esc).join(' · ')}${mult !== 1 ? ` · bonus ×${nf2.format(mult)}` : ''}</div></div>
      <div class="callout y"><div class="hint">Saatlik EXP</div><div class="big-result gold">${perH ? fmtShort(perH * mult) : '—'}</div><div class="hint">${K.auto ? `mob ${fmtN(mob[3])} HP → ~${fmtX(Math.round(K.sec * 10) / 10)} sn/mob · ` : ''}${fmtX(Math.round(kpm * 10) / 10)} mob/dk${mult !== 1 ? ' · bonus dahil' : ''}</div></div>
      <div class="callout"><div class="hint">Lv ${lv} → ${lv + 1}</div><div class="big-result">${perH ? fmtDur(need / (perH * mult)) : '—'}</div><div class="hint">${pk.exp ? fmtN(Math.ceil(need / (pk.exp * mult))) + ' mob' : ''}</div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn sm pri" data-act="xp-mob-use" data-lv="${lv}" data-r="${Math.round(perH)}" ${perH ? '' : 'disabled'}>${ICON.plus} Lv ${lv}'dan itibaren bu hızı kullan</button>
      <span class="hint" style="align-self:center">Kaynak: oyunun 2019 sunucu tabloları ve açık kaynak sunucu kodu. Resmî sunucuda etkinlik ve güncellemelerle farklı olabilir; birkaç dakika kasıp <b>Oturum kaydı</b> ile doğrula.</span>
    </div>` : ''}
  </div>`;
}
/** Oturum kayıtlarından ölçülen saatlik EXP (en son seviyedeki ortalama) */
function xpMeasured() {
  const ses = (S.exp.sessions || []).filter(s => s.minutes > 0 && s.endPct > s.startPct);
  if (!ses.length) return null;
  const lv = [...ses].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))[0].level;
  const same = ses.filter(s => s.level == lv);
  const dp = sum(same, s => s.endPct - s.startPct), h = sum(same, s => s.minutes) / 60;
  const eh = dp / 100 * xpNeed(+lv) / h;
  return eh > 0 ? { lv, eh } : null;
}
function xpSessionsCard() {
  const ses = [...S.exp.sessions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  return `<div class="card">
    <div class="card-h"><h3>Oturum kaydı</h3><button class="btn pri sm" data-act="exp-ses-add">${ICON.plus} Oturum</button></div>
    <div class="hint" style="margin-bottom:10px">Kasıl başı ve sonu yüzdeni gir; gerçek saatlik EXP'n ölçülür ve hesaba aktarılabilir.</div>
    ${ses.length ? `<div class="tbl-wrap" style="max-height:260px"><table><thead><tr><th>Tarih</th><th>Lv</th><th class="num">%</th><th class="num">Süre</th><th class="num">EXP/saat</th><th></th></tr></thead><tbody>
    ${ses.map(s => { const h = s.minutes / 60, dp = s.endPct - s.startPct, eh = h ? dp / 100 * xpNeed(+s.level) / h : 0; return `<tr><td class="mut">${fmtDate(s.date)}</td><td>${s.level}</td><td class="num">${fmtX(s.startPct)}→${fmtX(s.endPct)}</td><td class="num">${fmtDur(h)}</td><td class="num gold">${eh ? fmtShort(eh) : '—'}<div class="hint">%${fmtX(h ? dp / h : 0)}/sa</div></td><td><button class="icon-btn" data-act="exp-ses-del" data-id="${s.id}" title="Sil">${ICON.del}</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="mut">Kayıt yok.</div>'}
  </div>`;
}

Object.assign(ACTIONS, {
  'xp-mob-use': el => {
    const c = xpCalc(), lv = +el.dataset.lv, r = fmtShort(+el.dataset.r);
    const s = c.segs.find(x => Math.round(parseNum(x.lv)) === lv);
    if (s) s.rate = r; else if (c.segs.length === 1 && !parseAmt(c.segs[0].rate)) { c.segs[0].lv = lv; c.segs[0].rate = r; } else { c.segs.push({ lv, rate: r }); c.segs.sort((a, b) => parseNum(a.lv) - parseNum(b.lv)); }
    save(); render(); toast(`Lv ${lv}'dan itibaren ${r}/saat kullanılıyor`, 'ok');
  },
  'xp-seg-add': () => { const c = xpCalc(); const last = c.segs[c.segs.length - 1]; c.segs.push({ lv: Math.min(XP_MAX_LV, (Math.round(parseNum(last.lv)) || c.fromLv) + 10), rate: '' }); save(); render(); },
  'xp-seg-del': el => { const c = xpCalc(); c.segs.splice(+el.dataset.i, 1); save(); render(); },
  'xp-use-meas': () => {
    const m = xpMeasured(); if (!m) return; const c = xpCalc();
    const r = fmtShort(Math.round(m.eh));
    const s = c.segs.find(x => Math.round(parseNum(x.lv)) === +m.lv);
    if (s) s.rate = r; else if (c.segs.length === 1 && !parseAmt(c.segs[0].rate)) c.segs[0].rate = r; else c.segs.push({ lv: +m.lv, rate: r });
    save(); render(); toast('Ölçülen hız aktarıldı', 'ok');
  },
});
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (d.xp) { xpCalc()[d.xp] = t.value; save(); render(); }
  else if (d.xseg != null && d.xsf) { const s = xpCalc().segs[+d.xseg]; if (s) { s[d.xsf] = t.value; save(); render(); } }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.xpc) { xpCalc()[d.xpc] = t.checked; save(); render(); }
  else if (d.xp && t.tagName === 'SELECT') { xpCalc()[d.xp] = t.value; save(); render(); }
});
