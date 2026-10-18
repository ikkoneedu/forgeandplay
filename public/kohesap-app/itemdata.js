'use strict';
/* ==========================================================================
   KO Ekip — kendi item veritabanımız (dış siteye bağlı değil)
   itemdata/variants.json.gz : item adı → varyantlar [ilk numara-1, tür, blok, en yüksek +, etiket]
   itemdata/s<N>.json.gz     : item numarası → [kind, tür, ...özellikler (ITEMDATA_F sırası)]
   Veriler oyunun item tablosundan; enucuzgb kapansa da çalışır.
   ========================================================================== */
const IDATA = { base: 'itemdata/', cache: new Map(), vars: null };
async function idGz(file) {
  if (IDATA.cache.has(file)) return IDATA.cache.get(file);
  const p = (async () => {
    const r = await fetch(IDATA.base + file);
    if (!r.ok) throw new Error('veri dosyası yok: ' + file);
    const buf = await r.arrayBuffer();
    const u8 = new Uint8Array(buf);
    // sunucu zaten açmış olabilir (Content-Encoding); gzip imzası 1f 8b ise kendimiz açarız
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
      return JSON.parse(await ds.text());
    }
    return JSON.parse(new TextDecoder().decode(u8));
  })();
  IDATA.cache.set(file, p);
  p.catch(() => IDATA.cache.delete(file));
  return p;
}
async function idVariants() { if (!IDATA.vars) IDATA.vars = idGz('variants.json.gz'); return IDATA.vars; }
async function idRow(num) { const sh = await idGz(`s${Math.floor(num / 1e7)}.json.gz`); const r = sh[num]; return r ? idDecode(num, r, (await idVariants()).f) : null; }
function idDecode(num, r, F) { const o = { num, kind: r[0], type: r[1] }; F.forEach((f, i) => { o[f] = r[i + 2] || 0; }); return o; }
const ID_TYPE = { 0: 'Normal Item', 1: 'Magic Item', 2: 'Rare Item', 3: 'Craft Item', 4: 'Unique Item', 5: 'Upgrade Item', 11: 'Reverse Upgrade Item', 12: 'Reverse Unique Item' };
const ID_TYPE_TR = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Craft', 4: 'Unique', 5: 'Upgrade', 11: 'Reverse', 12: 'Reverse Unique' };
const ID_KIND = { 11: 'Dagger', 21: 'One-handed Sword', 22: 'Two-handed Sword', 31: 'One-handed Axe', 32: 'Two-handed Axe', 41: 'One-handed Club', 42: 'Two-handed Club', 51: 'One-handed Spear', 52: 'Two-handed Spear', 60: 'Shield', 70: 'Bow', 71: 'Crossbow', 110: 'Staff', 181: 'Priest Mace', 140: 'Jamadar', 91: 'Earring', 92: 'Necklace', 93: 'Ring', 94: 'Belt', 200: 'Kurian Armor', 210: 'Warrior Armor', 220: 'Rogue Armor', 230: 'Mage Armor', 240: 'Priest Armor', 252: 'Costume' };
/** varyantlar: Reverse için tür 11/12, normal için diğerleri */
async function idVariantsFor(base, rev) {
  const V = await idVariants(), key = String(base).toLowerCase(), list = V.v[key] || [];
  return list.filter(([, type]) => (type === 11 || type === 12) === rev)
    .map(([vb, type, size, maxLv, label]) => ({ vb, type, size, maxLv, label, name: V.n[key] || base, tlabel: ID_TYPE_TR[type] || 'Tür ' + type }));
}
/** seçim listesi: verilen seviyede özellikleri aynı olan varyantlar tek seçenek; etikette gerçek değerler */
async function idVariantOptions(vars, lv) {
  const rows = await Promise.all(vars.map(v => lv <= v.maxLv ? idRow(v.vb + lv) : null));
  const seen = new Map(), out = [];
  vars.forEach((v, i) => {
    const r = rows[i]; if (!r) return;
    const sig = JSON.stringify(Object.keys(ID_STAT_TR).map(k => r[k] || 0)) + '|' + v.type;
    if (seen.has(sig)) { seen.get(sig).alt.push(v.vb); return; }
    const el = [['FireDamage', 'Ateş'], ['IceDamage', 'Buz'], ['LightningDamage', 'Elektrik'], ['PoisonDamage', 'Zehir'], ['HPDrain', 'HP emme'], ['MPDrain', 'MP emme'], ['StrB', 'STR'], ['StaB', 'HP'], ['DexB', 'DEX'], ['IntelB', 'INT'], ['ChaB', 'MP'], ['MaxHpB', 'Max HP'], ['MaxMpB', 'Max MP']].filter(([k]) => r[k]).map(([k, n]) => `${n} ${r[k]}`);
    const main = r.Damage ? `AP ${r.Damage}` : r.Ac ? `Def ${r.Ac}` : '';
    const o = { ...v, alt: [v.vb], text: [v.tlabel, main, el.join(' · ') || 'bonussuz'].filter(Boolean).join(' · ') };
    seen.set(sig, o); out.push(o);
  });
  const pri = { 11: 0, 4: 1, 5: 2, 0: 3, 2: 4, 1: 5, 12: 6, 3: 7 };
  return out.sort((a, b) => (a.label !== 'Düz') - (b.label !== 'Düz') || (pri[a.type] ?? 9) - (pri[b.type] ?? 9) || a.vb - b.vb);
}
/** oyundaki tooltip görünümü (kendi verimizden) */
function idTipHtml(o, name, lv, iconSrc) {
  const L = (t, cls = '') => `<li${cls ? ` class="${cls}"` : ''}>${t}</li>`, sp = '<li class="clearfx"></li>';
  const lines = [];
  if (o.Duration) lines.push(L(`Durability : ${o.Duration}/${o.Duration} (100%)`, 'durability'), sp);
  if (o.Damage) lines.push(L(`Attack Power : ${o.Damage}`));
  if (o.Ac) lines.push(L(`Defense Ability : ${o.Ac}`));
  if (o.Duration) lines.push(L(`Max Durability : ${o.Duration}`));
  const add = (k, t, cls = 'type_8') => { if (o[k]) lines.push(L(`${t} : ${o[k]}`, cls)); };
  add('FireDamage', 'Flame Damage'); add('IceDamage', 'Glacier Damage'); add('LightningDamage', 'Lightning Damage'); add('PoisonDamage', 'Poison Damage');
  add('HPDrain', 'HP Drain'); add('MPDamage', 'MP Damage'); add('MPDrain', 'MP Drain'); add('MirrorDamage', 'Repel Physical Damage');
  add('DaggerAc', 'Defense Ability (Dagger)'); add('JamadarAC', 'Defense Ability (Jamadar)'); add('SwordAc', 'Defense Ability (Sword)'); add('MaceAc', 'Defense Ability (Club)'); add('AxeAc', 'Defense Ability (Axe)'); add('SpearAc', 'Defense Ability (Spear)'); add('BowAc', 'Defense Ability (Arrow)');
  add('StrB', 'Strength Bonus'); add('StaB', 'Health Bonus'); add('DexB', 'Dexterity Bonus'); add('IntelB', 'Intelligence Bonus'); add('ChaB', 'Magic Power Bonus'); add('MaxHpB', 'HP Bonus'); add('MaxMpB', 'MP Bonus');
  add('FireR', 'Resistance to Flame'); add('ColdR', 'Resistance to Glacier'); add('LightningR', 'Resistance to Lightning'); add('MagicR', 'Resistance to Magic'); add('PoisonR', 'Resistance to Poison'); add('CurseR', 'Resistance to Curse');
  lines.push(sp);
  if (o.Weight) lines.push(L(`Weight : ${(o.Weight / 10).toFixed(2)}`, 'weight'));
  const req = (k, t) => { if (o[k]) lines.push(L(`Required ${t} : ${o[k]}`, 'req')); };
  req('ReqLevel', 'Level'); req('ReqStr', 'Strength'); req('ReqSta', 'Health'); req('ReqDex', 'Dexterity'); req('ReqIntel', 'Intelligence'); req('ReqCha', 'Magic Power');
  return `<ul><li class="head"><span class="icon">${itemIcon(iconSrc, name, 45)}</span><span class="head-meta"><span class="title type_${o.type}">${esc(name)} (+${lv})</span><span class="type type_${o.type}">${esc(ID_TYPE[o.type] || '')}</span><span class="kind">${esc(ID_KIND[o.kind] || '')}</span></span></li>${lines.join('')}</ul>`;
}
/** iki seviye arasındaki sayısal farklar */
const ID_STAT_TR = { Damage: 'Attack Power', Ac: 'Defense', Duration: 'Durability', FireDamage: 'Flame Damage', IceDamage: 'Glacier Damage', LightningDamage: 'Lightning Damage', PoisonDamage: 'Poison Damage', HPDrain: 'HP Drain', MPDamage: 'MP Damage', MPDrain: 'MP Drain', MirrorDamage: 'Repel Damage', StrB: 'STR Bonus', StaB: 'HP Bonus', DexB: 'DEX Bonus', IntelB: 'INT Bonus', ChaB: 'MP Bonus', MaxHpB: 'Max HP', MaxMpB: 'Max MP', FireR: 'Flame Resist', ColdR: 'Glacier Resist', LightningR: 'Lightning Resist', MagicR: 'Magic Resist', PoisonR: 'Poison Resist', CurseR: 'Curse Resist', DaggerAc: 'Dagger Def', JamadarAC: 'Jamadar Def', SwordAc: 'Sword Def', MaceAc: 'Club Def', AxeAc: 'Axe Def', SpearAc: 'Spear Def', BowAc: 'Arrow Def', ReqStr: 'Required STR', ReqDex: 'Required DEX', ReqIntel: 'Required INT', ReqCha: 'Required MP', ReqSta: 'Required HP', ReqLevel: 'Required Level' };
function idDiff(a, b) { return Object.keys(ID_STAT_TR).filter(k => (a[k] || 0) !== (b[k] || 0)).map(k => ({ k: ID_STAT_TR[k], a: a[k] || 0, b: b[k] || 0, d: (b[k] || 0) - (a[k] || 0) })); }
