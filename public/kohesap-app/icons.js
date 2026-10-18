'use strict';
/* ==========================================================================
   KO Ekip — item ikonları kendi dosyalarımızda (dış siteye bağlı değil)
   icons/items.webp : tüm item ikonları tek resimde (45×45 kareler)
   icons/pus.webp   : PUS mağaza ikonları
   ICON_SPRITE      : ikon kodu → kare sırası (icons-map.js)
   Haritada olmayan bir ikon istenirse eskisi gibi uzaktan (aracı adres) denenir.
   ========================================================================== */
(function () {
  if (typeof ICON_SPRITE === 'undefined') return;
  const S = ICON_SPRITE;
  const pick = src => {
    const p = String(src || '');
    let m = p.match(/\/ItemIcon\/itemicon_([0-9_]+)\.(?:jpe?g|png|webp)$/i);
    if (m && S.items.idx[m[1]] != null) return { sheet: S.items, i: S.items.idx[m[1]] };
    m = p.match(/\/img\/pus\/([A-Za-z0-9_.\-]+)\.(?:png|jpe?g|webp)$/i);
    if (m && S.pus.idx[m[1]] != null) return { sheet: S.pus, i: S.pus.idx[m[1]] };
    return null;
  };
  const remoteIcon = itemIcon;
  itemIcon = function (src, name, size = 36, cls = '') {
    const h = pick(src);
    if (!h) return remoteIcon(src, name, size, cls);
    const { sheet, i } = h, col = i % sheet.cols, row = Math.floor(i / sheet.cols);
    const st = `background-image:url(${sheet.file});background-size:${sheet.cols * 100}% ${sheet.rows * 100}%;background-position:${sheet.cols > 1 ? col / (sheet.cols - 1) * 100 : 0}% ${sheet.rows > 1 ? row / (sheet.rows - 1) * 100 : 0}%`;
    return `<span class="ico spr ok ${cls}" style="--s:${size}px" role="img" aria-label="${esc(name || '')}"><b style="${st}"></b></span>`;
  };
})();
