'use strict';
/* ==========================================================================
   EKİP PLANI · YOKLAMA, DROP DAĞITIMI VE KATILIM GEÇMİŞİ
   Başlamış ya da bitmiş planda planı açan / lider:
     - yoklama alır (kim gerçekten geldi): plans/{id}.att = { uid: 1 }
     - düşen itemi dağıtır: zarla ya da adil sırayla (son 30 günde en az drop alan önce)
       plans/{id}.loot = [{ i, w, wn, m: 'zar'|'sira', r: { uid: zar }, at }]
   Herkes: katılım istatistiği ve planı kendi Parti & Drop defterine aktarma.
   Yoklama alınmamış planlarda "Geliyorum" diyenler gelmiş sayılır (beyan).
   ========================================================================== */
const EL = { item: {} };
const EL_DAYS = 30;
/** gelenler: yoklama varsa yoklama, yoksa "geliyorum" diyenler */
function elCame(p) {
  if (p.att && Object.keys(p.att).length) return Object.keys(p.att).filter(u => p.att[u]);
  return Object.keys(p.rsvp || {}).filter(u => p.rsvp[u] && p.rsvp[u].s === 'y');
}
const elName = (p, uid) => { const r = (p.rsvp || {})[uid]; if (r && r.cn) return r.cn; const m = teamMembers().find(x => x.uid === uid); return m ? teamMainName(m) : 'Üye'; };
const elRoll = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 100);
/** son 30 günde kim kaç drop aldı (tüm planlardan) */
function elWins(now = Date.now()) {
  const w = {};
  EP.list.filter(p => p.at >= now - EL_DAYS * 864e5).forEach(p => (p.loot || []).forEach(l => { w[l.w] = (w[l.w] || 0) + 1; }));
  return w;
}
/** adil sıra: en az drop alan önce; eşitlikte zar (roll=false: önizleme, zar atılmaz) */
function elQueue(p, roll = true, now = Date.now()) {
  const w = elWins(now);
  const q = elCame(p).map(u => ({ u, n: w[u] || 0, r: roll ? elRoll() : 0 }));
  q.sort((a, b) => a.n - b.n || b.r - a.r);
  return q;
}

/* ---------- yazma (planı açan ya da lider) ---------- */
// mergeFields: att / loot alanı bütünüyle yazılır (merge iç içe haritayı birleştirir, yoklamadan çıkarmak işlemezdi)
async function elSave(p, patch, msg) {
  try { await FB.setDoc(epRef(TEAM.code, p.id), patch, { mergeFields: Object.keys(patch) }); if (msg) toast(msg, 'ok'); }
  catch (e) { toast(isPermErr(e) ? 'İzin yok: Firebase kurallarını güncelle' : e.message, 'err'); }
}
function elGive(p, mode) {
  const item = String(EL.item[p.id] || '').trim().slice(0, 40);
  if (!item) return toast('Item adını yaz', 'err');
  const came = elCame(p);
  if (!came.length) return toast('Gelen kimse yok: önce yoklama al ya da "Geliyorum" cevapları gelsin', 'err');
  let w, r = {};
  if (mode === 'zar') {
    came.forEach(u => { r[u] = elRoll(); });
    const max = Math.max(...Object.values(r));
    const top = came.filter(u => r[u] === max);
    w = top[crypto.getRandomValues(new Uint32Array(1))[0] % top.length];
  } else {
    const q = elQueue(p); w = q[0].u; q.forEach(x => { r[x.u] = x.r; });
  }
  const entry = { i: item, w, wn: elName(p, w).slice(0, 30), m: mode, r, at: Date.now() };
  const loot = [...(p.loot || []), entry].slice(-40);
  EL.item[p.id] = '';
  elSave(p, { loot }, `${item} → ${entry.wn}`);
  if (typeof botSay === 'function') {
    const det = mode === 'zar' ? came.map(u => `${elName(p, u)} ${r[u]}`).sort((a, b) => +b.split(' ').pop() - +a.split(' ').pop()).join(' · ') : `adil sıra (son ${EL_DAYS} günde en az drop alan)`;
    botSay(`${mode === 'zar' ? '🎲' : '🔁'} **${item}** → **${entry.wn}** · ${p.t}\n${det}`, 'zar').catch(() => { });
  }
}
/** planı kendi Parti & Drop defterine aktar (gelenler + dağıtılan itemler) */
function elToParty(p) {
  const came = elCame(p);
  if (!came.length) return toast('Gelen kimse yok', 'err');
  const members = came.map(u => ({ id: uid(), uid: u, name: elName(p, u), weight: 1, me: u === myUid() }));
  if (!members.some(m => m.me)) members[0].me = true;
  const byUid = Object.fromEntries(members.map(m => [m.uid, m.id]));
  const drops = (p.loot || []).map(l => { const pr = S.prices.find(x => x.name.toLocaleLowerCase('tr') === l.i.toLocaleLowerCase('tr')); return { id: uid(), item: l.i, qty: 1, value: pr ? pr.price : 0, looter: byUid[l.w] || '', sold: false, soldPrice: 0 }; });
  const party = { id: uid(), name: p.t, date: localDate(new Date(p.at)), place: (typeof guideByPid === 'function' && p.ev && guideByPid(p.ev) ? guideByPid(p.ev).n : ''), members: members.map(({ uid: _u, ...m }) => m), drops, leaderId: '', leaderPct: 0, feePct: 0, costs: 0, costPayer: '', status: 'acik', note: '' };
  S.parties.push(party); ui.partyId = party.id; ui.page = 'parti'; save(); render();
  toast(`${members.length} kişi ve ${drops.length} item partiye aktarıldı${drops.some(d => !d.value) ? ' · değeri olmayan itemlere fiyat gir' : ''}`, 'ok');
}

/* ---------- plan kartındaki bölüm ---------- */
function epAfter(p, rows) {
  const can = epCanEdit(p), att = p.att || {}, hasAtt = Object.keys(att).length > 0, came = elCame(p);
  const loot = p.loot || [];
  const chip = x => {
    const on = hasAtt ? !!att[x.m.uid] : !!(x.r && x.r.s === 'y');
    const name = x.r && x.r.cn ? x.r.cn : teamMainName(x.m);
    return can ? `<button class="el-chip ${on ? 'on' : ''}" data-act="el-att" data-id="${esc(p.id)}" data-uid="${esc(x.m.uid)}">${on ? '✓ ' : ''}${esc(name)}</button>`
      : `<span class="el-chip ${on ? 'on' : ''}">${on ? '✓ ' : ''}${esc(name)}</span>`;
  };
  const q = can && came.length ? elQueue(p, false) : [];
  const tie = q.filter(x => q.length && x.n === q[0].n);
  return `<div class="el-box">
    <div class="el-h"><b>Yoklama</b><span class="mut">${hasAtt ? `${came.length} kişi geldi` : can ? 'gelenlere dokun' : '"Geliyorum" diyenler gelmiş sayılır'}</span></div>
    <div class="el-chips">${rows.map(chip).join('')}</div>
    <div class="el-h"><b>Drop</b><span class="mut">${loot.length ? loot.length + ' item dağıtıldı' : 'henüz dağıtılmadı'}</span></div>
    ${loot.length ? `<div class="el-loot">${loot.slice().reverse().map(l => `<div><span>${l.m === 'zar' ? '🎲' : '🔁'} ${esc(l.i)}</span><b>${esc(l.wn)}</b>${l.m === 'zar' && l.r && l.r[l.w] ? `<small>${l.r[l.w]}</small>` : ''}</div>`).join('')}</div>` : ''}
    ${can ? `<div class="el-give">
      <input class="inp" list="el-dl" data-el-item="${esc(p.id)}" value="${esc(EL.item[p.id] || '')}" placeholder="Düşen item" maxlength="40" autocomplete="off">
      <button class="btn sm" data-act="el-give" data-id="${esc(p.id)}" data-m="zar" title="Gelenler 1–100 zar atar">🎲 Zar</button>
      <button class="btn sm" data-act="el-give" data-id="${esc(p.id)}" data-m="sira" title="Son ${EL_DAYS} günde en az drop alana">🔁 Sıra</button>
    </div>${q.length ? `<div class="hint">Sıradaki hak: <b>${tie.map(x => esc(elName(p, x.u))).join(', ')}</b> · son ${EL_DAYS} günde ${q[0].n} drop${tie.length > 1 ? ' (eşitler arasında zar atılır)' : ''}</div>` : ''}` : ''}
    <div class="el-foot"><button class="btn sm ghost" data-act="el-party" data-id="${esc(p.id)}">${ICON.parti} Parti & Drop'a aktar</button></div>
  </div>`;
}

/* ---------- katılım istatistiği ---------- */
function epStatsCard(now) {
  const past = EP.list.filter(p => p.at < now && p.at >= now - EL_DAYS * 864e5);
  if (!past.length) return '';
  const wins = elWins(now);
  const rows = teamMembers().map(m => {
    const came = past.filter(p => elCame(p).includes(m.uid)).length;
    return { m, came, no: past.length - came, pct: Math.round(came / past.length * 100), w: wins[m.uid] || 0 };
  }).sort((a, b) => b.pct - a.pct || a.w - b.w);
  return `<section class="card el-stats">
    <div class="card-h"><h3>Katılım · son ${EL_DAYS} gün</h3><span class="sub">${past.length} plan</span></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Üye</th><th class="num">Geldi</th><th class="num">Oran</th><th class="num">Gelmedi</th><th class="num">Drop</th></tr></thead>
      <tbody>${rows.map(x => `<tr>
        <td><span class="el-who">${x.m.mainChar ? charAvatar(x.m.mainChar, 22) : ''}${esc(teamMainName(x.m))}</span></td>
        <td class="num">${x.came}/${past.length}</td>
        <td class="num"><span class="el-bar" style="--v:${x.pct}"><i></i></span> ${x.pct}%</td>
        <td class="num mut">${x.no}</td>
        <td class="num">${x.w}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="hint" style="margin-top:8px">"Geldi": yoklama alınan planlarda yoklama, alınmayanlarda "Geliyorum" cevabı. Drop: bu planlarda dağıtılan itemler.</div>
  </section>`;
}

Object.assign(ACTIONS, {
  'el-att': el => {
    const p = EP.list.find(x => x.id === el.dataset.id); if (!p) return;
    // ilk yoklamada "geliyorum" diyenlerle başla
    const att = p.att && Object.keys(p.att).length ? { ...p.att } : Object.fromEntries(elCame(p).map(u => [u, 1]));
    const u = el.dataset.uid;
    if (att[u]) delete att[u]; else att[u] = 1;
    // hepsi kaldırılırsa boş harita kalır → "kimse gelmedi" demek; beyana dönmemesi için işaret
    elSave(p, { att: Object.keys(att).length ? att : { _: 0 } });
  },
  'el-give': el => { const p = EP.list.find(x => x.id === el.dataset.id); if (p) elGive(p, el.dataset.m); },
  'el-party': el => { const p = EP.list.find(x => x.id === el.dataset.id); if (p) elToParty(p); },
});
document.addEventListener('input', e => { const id = e.target.dataset && e.target.dataset.elItem; if (id != null) EL.item[id] = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.dataset || e.target.dataset.elItem == null) return;
  const p = EP.list.find(x => x.id === e.target.dataset.elItem); if (p) elGive(p, 'zar');
});
/* item önerileri: fiyat listesi */
const _planlaV = VIEWS.planla;
VIEWS.planla = () => _planlaV() + `<datalist id="el-dl">${(S.prices || []).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>`;
