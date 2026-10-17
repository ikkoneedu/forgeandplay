/* ==========================================================================
   KO Ekip — item görselleri, PUS mağaza görünümü, item detay penceresi
   Görseller kaynak sitenin kendi ikonlarıdır; koruma sayfası yüzünden
   tarayıcı doğrudan alamadığı için exe'de /api/img, web'de /api/kohesap/img
   üzerinden (önbellekli) gelir.
   ========================================================================== */

/* ---------- ikon adresi ---------- */
function iconUrl(src) {
  if (!src) return '';
  let p = String(src);
  try { if (/^https?:/i.test(p)) p = new URL(p).pathname; } catch { return ''; }
  if (!p.startsWith('/')) p = '/' + p;
  if (!/^\/(ItemIcon|img\/pus|img\/items?)\/[A-Za-z0-9_.\-]+\.(png|jpe?g|webp|gif)$/.test(p)) return '';
  return serverMode ? `/api/img?p=${encodeURIComponent(p)}&base=${encodeURIComponent(arBase())}` : `/api/kohesap/img?p=${encodeURIComponent(p)}`;
}
const monogram = name => {
  const w = String(name || '?').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9 ]/g, ' ').trim().split(/\s+/);
  return esc(((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase());
};
/** Kare item ikonu; görsel gelmezse baş harfli yer tutucu kalır. */
/** Sitenin kendi adresi (yedek): aracı adres çalışmazsa tarayıcı doğrudan dener. */
function iconDirect(src) {
  if (!src) return '';
  try { return new URL(String(src), arBase() + '/').href; } catch { return ''; }
}
function iconFail(img) {
  if (!img.dataset.f && img.dataset.d) { img.dataset.f = '1'; img.src = img.dataset.d; return; }
  img.remove();
}
function itemIcon(src, name, size = 36, cls = '') {
  const u = iconUrl(src), d = iconDirect(src);
  return `<span class="ico ${cls}" style="--s:${size}px" aria-hidden="true"><i>${monogram(name)}</i>${u ? `<img src="${esc(u)}" data-d="${esc(d)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="iconFail(this)">` : ''}</span>`;
}

/* ---------- PUS ikonları (katalog adına göre) ---------- */
const pusKey = s => trLow(String(s)).replace(/[^a-z0-9]/g, '');
const PUS_ICON_BY_NAME = (() => {
  const m = new Map(); let i = 0;
  for (const items of Object.values(PUS_DEFAULT)) for (const [name] of items) m.set(pusKey(name), PUS_ICONS[i++]);
  return m;
})();
function pusIconOf(it) {
  const slug = PUS_ICON_BY_NAME.get(pusKey(it.name)) || (/^p\d+$/.test(it.id) ? PUS_ICONS[+it.id.slice(1)] : '');
  return slug ? `/img/pus/${slug}.png` : '';
}

/* ---------- PUS: mağaza görünümü ---------- */
const PUS_CAT_SHORT = { 'Stat Scroll & Reset': 'Stat', 'Buff, Scroll & Pot': 'Buff', 'Ekipman, Pet & Görünüm': 'Ekipman', 'Hizmet & Diğer': 'Diğer' };
const _purchaseView = oldPusView; // alt kısımdaki "alımlarım" listesi (app.js)
VIEWS.pus = () => {
  const st = S.settings, P = S.pus, k = kcTL();
  const q = trLow(ui.pusQ || ''), cat = ui.pusCat || 'all', edit = !!ui.pusEdit;
  const cats = [...new Set(P.catalog.map(x => x.cat))];
  const list = P.catalog.filter(x => (cat === 'all' || x.cat === cat) && (!q || trLow(x.name).includes(q)));
  const inCart = new Map(P.cart.map(c => [c.id, c.qty]));
  const cart = P.cart.map(c => ({ c, it: P.catalog.find(x => x.id === c.id) })).filter(x => x.it);
  const totKC = sum(cart, x => x.it.kc * x.c.qty), qtyAll = sum(cart, x => x.c.qty);
  const packKC = st.kcPackKC || 400, packs = Math.ceil(totKC / packKC);
  const cashTL = packs * (st.kcPackTL || KC_DEFAULT.tl), propTL = totKC * k, gb = st.gbTL ? propTL / st.gbTL : 0;
  const count = c => P.catalog.filter(x => x.cat === c).length;
  const card = x => {
    const qn = inCart.get(x.id) || 0;
    const tl = k ? fmtTL(kcItemTL(x.kc)) : '';
    const g = k && st.gbTL ? nf2.format(kcItemTL(x.kc) / st.gbTL) + ' GB' : '';
    return `<div class="pus-card ${qn ? 'in' : ''}" ${edit ? '' : `data-act="cart-add" data-id="${x.id}" role="button" tabindex="0" title="Sepete ekle"`}>
      ${qn ? `<span class="pus-qty">${qn}</span>` : ''}
      ${itemIcon(x.icon || pusIconOf(x), x.name, 48, 'pus-ico')}
      <div class="pus-name" title="${esc(x.name)}">${esc(x.name)}</div>
      ${edit
        ? `<label class="pus-edit"><input class="inp num" data-fk="pk-${x.id}" data-pusk="${x.id}" value="${fmtN(x.kc)}"><span>KC</span></label>
           ${x.custom ? `<button class="icon-btn" data-act="pusc-del" data-id="${x.id}" title="Sil">${ICON.del}</button>` : ''}`
        : `<div class="pus-kc">${fmtN(x.kc)} <small>KC</small></div><div class="pus-sub">${[tl, g].filter(Boolean).join(' · ') || '&nbsp;'}</div>`}
    </div>`;
  };
  const cartRows = cart.map(({ c, it }) => `
    <div class="cart-row">${itemIcon(it.icon || pusIconOf(it), it.name, 34)}
      <span class="cart-name">${esc(it.name)}<span class="hint">${fmtN(it.kc)} KC</span></span>
      <span class="stepper"><button data-act="cart-dec" data-id="${it.id}" aria-label="Azalt">−</button><input class="inp num" data-fk="cq-${it.id}" data-cartq="${it.id}" value="${c.qty}" inputmode="numeric"><button data-act="cart-add" data-id="${it.id}" aria-label="Arttır">+</button></span>
      <span class="num cart-sum">${k ? fmtTL(kcItemTL(it.kc * c.qty)) : fmtN(it.kc * c.qty) + ' KC'}</span>
    </div>`).join('');
  return `
  <div class="pus-layout">
    <section class="card pus-shop">
      <div class="pus-head">
        <div><h3>PUS mağazası</h3><span class="mut">${P.catalog.length} item · karta dokun, sepete eklensin</span></div>
        <span class="spacer"></span>
        <label class="search pus-search"><input class="inp" placeholder="Item ara" data-fk="pusQ" data-bind-ui="pusQ" value="${esc(ui.pusQ || '')}"></label>
        <button class="btn sm ${edit ? 'pri' : 'ghost'}" data-act="pus-edit-toggle">${edit ? 'Bitti' : 'Fiyatları düzenle'}</button>
        <button class="btn sm ghost" data-act="pusc-add">${ICON.plus} Özel item</button>
        ${isAdmin() ? '<button class="btn sm ghost" data-act="pub-pus" title="KC fiyatlarını tüm kullanıcılara gönder">Herkese yayınla</button>' : ''}
      </div>
      <div class="chips">${[['all', 'Tümü', P.catalog.length], ...cats.map(c => [c, PUS_CAT_SHORT[c] || c, count(c)])].map(([v, l, n]) =>
        `<button class="chip ${cat === v ? 'on' : ''}" data-act="set" data-k="pusCat" data-v="${esc(v)}">${esc(l)}<b>${n}</b></button>`).join('')}</div>
      ${!k ? `<div class="callout" style="margin:0 0 14px">TL ve GB karşılıklarını görmek için sağdaki <b>${fmtN(packKC)} KC paket fiyatını</b> girin.</div>` : ''}
      ${list.length ? `<div class="pus-grid">${list.map(card).join('')}</div>` : empty('Bulunamadı', 'Aramayı veya kategoriyi değiştirin.')}
    </section>
    <aside class="card pus-cart" id="pusCart">
      <div class="card-h"><h3>Sepet ${qtyAll ? `<span class="badge g">${qtyAll}</span>` : ''}</h3>${cart.length ? `<button class="btn sm ghost" data-act="cart-clear">Temizle</button>` : ''}</div>
      <div class="form" style="margin-bottom:14px">
        <label class="f">${fmtN(packKC)} KC paket (TL)<input class="inp num" data-fk="kcPackTL2" data-set="kcPackTL" data-num="1" value="${nf2.format(st.kcPackTL || KC_DEFAULT.tl)}" placeholder="örn. 227,50"><span class="hint">${esc(kcInfo())} · <a href="#" data-act="kc-refresh">şimdi güncelle</a></span></label>
        <label class="f">1 GB (TL)${st.server ? ' · ' + esc(st.server) : ''}<input class="inp num" data-fk="gbTL2" data-set="gbTL" data-num="1" value="${st.gbTL ? nf2.format(st.gbTL) : ''}"></label>
      </div>
      ${cart.length ? `<div class="cart-list">${cartRows}</div>` : '<div class="empty" style="padding:22px 10px"><b>Sepet boş</b>Soldaki kartlara dokunarak item ekleyin.</div>'}
      <div class="kv" style="margin-top:16px">
        <span class="k">Toplam KC</span><span class="v">${fmtN(totKC)}</span>
        <span class="k">Gereken paket</span><span class="v">${packs} × ${fmtN(packKC)} KC${totKC ? ` <span class="mut" style="font-weight:400">(${fmtN(packs * packKC - totKC)} KC artar)</span>` : ''}</span>
        <span class="k">Ödenecek nakit</span><span class="v">${fmtTL(cashTL)}</span>
        <span class="sep"></span>
        <span class="k">Orantılı maliyet</span><span class="v big-result" style="font-size:22px">${k ? fmtTL(propTL) : '—'}</span>
        <span class="k">GB karşılığı</span><span class="v gold">${gb ? nf2.format(gb) + ' GB' : '—'}</span>
        <span class="k">Oyun içi (noah)</span><span class="v">${gb ? fmtN(gb * st.gbNoah) : '—'}</span>
        <span class="k">USD</span><span class="v">${k && st.usdTL ? '$' + nf2.format(propTL / st.usdTL) : '—'}</span>
      </div>
      ${cart.length ? `<button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="cart-buy">Satın aldım — giderlere kaydet</button>` : ''}
    </aside>
  </div>
  ${cart.length ? `<button class="pus-bar" data-act="pus-to-cart"><span class="badge g">${qtyAll}</span><span>${fmtN(totKC)} KC</span><b>${k ? fmtTL(propTL) : ''}</b><span class="mut">Sepete git ›</span></button>` : ''}
  ${_purchaseView()}`;
};
Object.assign(ACTIONS, {
  'pus-edit-toggle': () => { ui.pusEdit = !ui.pusEdit; render(); },
  'cart-dec': el => { const c = S.pus.cart.find(x => x.id === el.dataset.id); if (!c) return; if (--c.qty <= 0) S.pus.cart = S.pus.cart.filter(x => x !== c); save(); render(); },
  'pus-to-cart': () => { const c = document.getElementById('pusCart'); c && c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
});
// kart klavye ile de eklenebilsin
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('pus-card') && e.target.dataset.act) { e.preventDefault(); e.target.click(); }
});

/* ---------- canlı pazar: ikonlar + satır tıklayınca detay ---------- */
function arRowItem(r, i) {
  return `<button class="ar-item" data-act="ar-open" data-i="${i}" title="Item detayı">${itemIcon(r.icon, r.name, 32)}<b>${esc(r.name || '—')}</b></button>`;
}

/* ---------- item detay penceresi ---------- */
const ITEM = { seq: 0 };
function itemApi(params) {
  const qs = new URLSearchParams(params);
  if (serverMode) { qs.set('base', arBase()); return fetch('/api/eitem?' + qs).then(r => r.json()); }
  return authFetch('/api/kohesap/item?' + qs).then(r => r.json());
}
function listApi(params) {
  const qs = new URLSearchParams({ query: '', minPrice: '', maxPrice: '', server: '', grade: '', type: 'sell', priceshort: 'asc', ...params });
  if (serverMode) {
    qs.set('base', arBase());
    return fetch('/api/ares?' + qs).then(r => r.json()).then(r => (Array.isArray(r) ? r : r.items || []).map(arNorm));
  }
  qs.set('per', '200');
  return authFetch('/api/kohesap/market?' + qs).then(r => r.json()).then(r => r.ok ? r.items.map(arNorm) : []);
}
/** Sitenin tooltip HTML'ini güvenli hale getirir: yalnızca bilinen etiketler ve sınıflar kalır. */
function cleanTooltip(html, iconSrc, name) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const ok = new Set(['DIV', 'UL', 'LI', 'SPAN', 'BR', 'B', 'I', 'SMALL', 'P']);
  const walk = node => {
    [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !ok.has(c.tagName)) { c.remove(); return; }
      const cls = (c.getAttribute('class') || '').split(/\s+/).filter(x => /^[a-z][a-z0-9_-]{0,30}$/i.test(x));
      [...c.attributes].forEach(a => c.removeAttribute(a.name));
      if (cls.length) c.setAttribute('class', cls.join(' '));
      walk(c);
    });
  };
  const root = doc.body.firstElementChild; walk(root);
  const icon = root.querySelector('.icon');
  if (icon) icon.innerHTML = itemIcon(iconSrc, name, 45);
  return root.innerHTML;
}
function priceChart(rows) {
  if (!rows.length) return '';
  const W = 640, H = 200, L = 58, R = 12, T = 12, B = 26;
  const xs = rows.map((_, i) => L + (rows.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (rows.length - 1)));
  const lo = Math.min(...rows.map(r => r.min)), hi = Math.max(...rows.map(r => r.max));
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1, y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  const band = rows.map((r, i) => `${xs[i]},${y(r.max)}`).join(' ') + ' ' + rows.map((r, i) => `${xs[i]},${y(r.min)}`).reverse().join(' ');
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${xs[i]},${y(r.avg)}`).join(' ');
  const ticks = [y0, (y0 + y1) / 2, y1];
  const lbl = d => { const [, m, dd] = d.split('-'); return `${dd}.${m}`; };
  const every = Math.max(1, Math.ceil(rows.length / 7));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Fiyat geçmişi">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid-l"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtShort(t)}</text>`).join('')}
    <polygon points="${band}" class="band"/>
    <path d="${line}" class="avg"/>
    ${rows.map((r, i) => `<circle cx="${xs[i]}" cy="${y(r.avg)}" r="3.5" class="pt"><title>${lbl(r.date)} · ort. ${fmtN(Math.round(r.avg))} · en düşük ${fmtN(r.min)} · en yüksek ${fmtN(r.max)} · ${r.n} ilan</title></circle>`).join('')}
    ${rows.map((r, i) => i % every === 0 || i === rows.length - 1 ? `<text x="${xs[i]}" y="${H - 6}" text-anchor="middle">${lbl(r.date)}</text>` : '').join('')}
  </svg>`;
}
function openItem(r) {
  const my = ++ITEM.seq;
  const price = +r.price || cellNum(r.price), tl = tlOf(price);
  const srvRaw = (r.raw && r.raw.strServerName) || String(r.server || '').toUpperCase().replace(/-/g, '');
  formCtx = null;
  $('#modalTitle').textContent = r.name || 'Item';
  $('.modal').style.width = 'min(900px,100%)';
  $('#modalBody').innerHTML = `
    <div class="itm">
      <div class="ko-tip" id="itmTip"><div class="ko-tip-load">${itemIcon(r.icon, r.name, 45)}<b>${esc(r.name)}</b><span class="mut">oyun içi bilgi yükleniyor…</span></div></div>
      <div class="itm-side">
        <div class="itm-price"><span class="mut">${r.mtype == 1 ? 'Alış ilanı' : 'Satış ilanı'}</span><b>${fmtN(price)}</b><span>${nf2.format(price / (S.settings.gbNoah || 1e8))} GB${tl != null ? ' · ' + fmtTL(tl) : ''}</span></div>
        <div class="kv">
          <span class="k">Satıcı</span><span class="v">${esc(r.seller || '—')}</span>
          <span class="k">Server</span><span class="v">${esc(r.server || '—')}</span>
          <span class="k">Koordinat</span><span class="v">${r.x !== '' && r.x != null ? `${esc(r.x)}, ${esc(r.z)}` : '—'}</span>
          <span class="k">Tarih</span><span class="v">${arWhen(r.date)}</span>
        </div>
        <div class="itm-actions">
          <button class="btn pri sm" data-act="itm-toprice">${ICON.plus} Fiyat listeme ekle</button>
          ${r.x !== '' && r.x != null ? `<button class="btn sm" data-act="itm-copy" data-v="${esc(r.x)}, ${esc(r.z)}">Koordinatı kopyala</button>` : ''}
        </div>
      </div>
    </div>
    <h4 class="itm-h">Fiyat geçmişi <span class="mut">· ${esc(r.server || 'tüm sunucular')}</span></h4>
    <div id="itmHist" class="itm-box"><div class="skeleton" style="height:180px"></div></div>
    <h4 class="itm-h">Bu item'ın diğer ilanları</h4>
    <div id="itmOthers" class="itm-box"><div class="skeleton" style="height:120px"></div></div>`;
  $('#modalFoot').innerHTML = `<button class="btn ghost" data-act="modal-close">Kapat</button>`;
  $('#modalBack').hidden = false;
  ITEM.cur = r;
  const alive = () => my === ITEM.seq && !$('#modalBack').hidden;

  if (r.id !== '' && r.id != null) {
    itemApi({ action: 'tooltip', itemId: r.id }).then(j => {
      if (!alive()) return;
      const box = $('#itmTip');
      if (j && j.html) box.innerHTML = cleanTooltip(j.html, r.icon, r.name);
      else box.querySelector('.mut').textContent = 'oyun içi bilgi bulunamadı';
    }).catch(() => { if (alive()) $('#itmTip .mut').textContent = 'oyun içi bilgi alınamadı'; });
    itemApi({ action: 'price_history', itemId: r.id, server: srvRaw, mType: r.mtype ?? 0 }).then(j => {
      if (!alive()) return;
      const data = (j && (j.data || j.items)) || (Array.isArray(j) ? j : []);
      const rows = data.map(d => ({ date: String(d.date || '').slice(0, 10), avg: +d.avgPrice || 0, min: +d.minPrice || +d.avgPrice || 0, max: +d.maxPrice || +d.avgPrice || 0, n: +d.listingsCount || 0 })).filter(d => d.date && d.avg).sort((a, b) => a.date.localeCompare(b.date));
      const box = $('#itmHist');
      if (!rows.length) { box.innerHTML = '<div class="empty" style="padding:18px"><b>Geçmiş yok</b>Bu item için kayıtlı fiyat geçmişi bulunamadı.</div>'; return; }
      const last = rows[rows.length - 1], first = rows[0];
      const ch = first.avg ? (last.avg - first.avg) / first.avg * 100 : 0;
      box.innerHTML = `
        <div class="itm-stats">
          <div><span>Son ortalama</span><b>${fmtShort(last.avg)}</b></div>
          <div><span>En düşük</span><b>${fmtShort(Math.min(...rows.map(x => x.min)))}</b></div>
          <div><span>En yüksek</span><b>${fmtShort(Math.max(...rows.map(x => x.max)))}</b></div>
          <div><span>Değişim</span><b class="${ch > 0 ? 'pos' : ch < 0 ? 'neg' : ''}">${ch > 0 ? '+' : ''}${nf2.format(ch)}%</b></div>
          <div><span>Toplam ilan</span><b>${fmtN(sum(rows, x => x.n))}</b></div>
        </div>${priceChart(rows)}<div class="hint">Çizgi günlük ortalama, gölge en düşük–en yüksek aralığı. Noktaların üzerine gelince ayrıntı görünür.</div>`;
    }).catch(() => { if (alive()) $('#itmHist').innerHTML = '<div class="empty" style="padding:18px"><b>Fiyat geçmişi alınamadı</b>Biraz sonra tekrar deneyin.</div>'; });
  } else {
    $('#itmTip .mut').textContent = '';
    $('#itmHist').innerHTML = '<div class="empty" style="padding:18px"><b>Geçmiş yok</b></div>';
  }

  const same = x => trLow(x.name) === trLow(r.name);
  const local = serverMode && ui.ar.all.length && !ui.ar.f.query ? ui.ar.all.filter(same) : null;
  (local && local.length > 1 ? Promise.resolve(local) : listApi({ query: r.name, type: ui.ar.f.type, server: ui.ar.f.server }).then(l => l.filter(same)))
    .then(list => {
      if (!alive()) return;
      list = list.slice().sort((a, b) => (+a.price || 0) - (+b.price || 0));
      const box = $('#itmOthers');
      if (!list.length) { box.innerHTML = '<div class="empty" style="padding:18px"><b>Başka ilan yok</b></div>'; return; }
      const prices = list.map(x => +x.price || 0).filter(Boolean);
      const bySrv = {}; list.forEach(x => { (bySrv[x.server] = bySrv[x.server] || []).push(+x.price || 0); });
      ITEM.others = list;
      box.innerHTML = `
        <div class="itm-stats">
          <div><span>İlan</span><b>${list.length}</b></div>
          <div><span>En ucuz</span><b>${fmtShort(Math.min(...prices))}</b></div>
          <div><span>Ortanca</span><b>${fmtShort(prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)])}</b></div>
          <div><span>En pahalı</span><b>${fmtShort(Math.max(...prices))}</b></div>
        </div>
        <div class="srv-chips">${Object.entries(bySrv).sort((a, b) => Math.min(...a[1]) - Math.min(...b[1])).map(([s, p]) => `<span class="chip">${esc(s)} <b>${fmtShort(Math.min(...p))}</b><small>${p.length}</small></span>`).join('')}</div>
        <div class="tbl-wrap" style="max-height:260px"><table><thead><tr><th>Satıcı</th><th>Server</th><th class="num">Fiyat</th><th>Koordinat</th></tr></thead><tbody>
        ${list.slice(0, 50).map(x => `<tr class="${x.seller === r.seller && +x.price === +r.price ? 'row-new' : ''}"><td>${esc(x.seller || '—')}</td><td><span class="badge">${esc(x.server)}</span></td><td class="num"><b>${fmtN(+x.price || 0)}</b></td><td class="mut">${x.x !== '' && x.x != null ? `${esc(x.x)}, ${esc(x.z)}` : '—'}</td></tr>`).join('')}
        </tbody></table></div>`;
    }).catch(() => { if (alive()) $('#itmOthers').innerHTML = '<div class="empty" style="padding:18px"><b>İlanlar alınamadı</b></div>'; });
}
Object.assign(ACTIONS, {
  'ar-open': el => { const r = arPageRows()[+el.dataset.i]; if (r) openItem(r); },
  'itm-toprice': () => {
    const r = ITEM.cur; if (!r) return;
    const price = +r.price || cellNum(r.price);
    let p = S.prices.find(x => trLow(x.name) === trLow(r.name));
    if (!p) { p = { id: uid(), name: String(r.name), cat: 'Pazardan', price: 0, updated: localDate(), hist: [] }; S.prices.push(p); }
    setPrice(p, Math.round(price), 'pazar'); save(); toast(`${r.name} fiyat listene eklendi (${fmtShort(price)})`, 'ok');
  },
  'itm-copy': el => { navigator.clipboard && navigator.clipboard.writeText(el.dataset.v).then(() => toast('Koordinat kopyalandı', 'ok')).catch(() => toast(el.dataset.v)); },
});
