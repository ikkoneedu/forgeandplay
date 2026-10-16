'use strict';
/* Hazır veriler — programın içinde düzenlenebilir.
   PUS fiyatları: normal (indirimsiz) KC fiyatları, Ekim 2026 kontrolü.
   EXP tablosu: seviye → o seviyeyi bitirmek (bir sonrakine geçmek) için gereken EXP. */

const PUS_DEFAULT = {
  'Premium': [['EXP Premium', 2796], ['DC Premium', 2159], ['War Premium', 2599], ['Platinum Premium', 2796], ['Gold Premium', 1996], ['Bronze Premium', 716], ['Switching Premium', 3596]],
  'Stat Scroll & Reset': [['Power of Lion Scroll (L)', 229], ['Power of Lion Scroll (S)', 129], ['STR+ Scroll (L)', 169], ['STR+ Scroll (S)', 69], ['HP+ Scroll (L)', 159], ['HP+ Scroll (S)', 69], ['DEX+ Scroll (L)', 169], ['DEX+ Scroll (S)', 69], ['INT+ Scroll (L)', 69], ['INT+ Scroll (S)', 29], ['MP+ Scroll (L)', 69], ['MP+ Scroll (S)', 39], ['Redistribution Item (stat/skill reset)', 799], ['HP Maestro Voucher', 200], ['MP Maestro Voucher', 200]],
  'Buff, Scroll & Pot': [['Resurrection Scroll (80) [Sea]', 349], ['150 Defense+ Scroll (S)', 49], ['1500 Health+ Scroll (L)', 149], ['1000 Health+ Scroll (L)', 99], ['500 Health+ Scroll (L)', 49], ['300 Defense+ Scroll (L)', 149], ['150 Defense+ Scroll (L)', 79], ['Speed+ Potion', 79], ['Attack Damage+ Scroll', 159], ['60% Re-Spawn Scroll', 69], ['Symbol of Gladiator (10 adet)', 769], ['Symbol of Gladiator (5 adet)', 499], ['Symbol of Gladiator', 109], ['Symbol of Warrior', 109], ['Symbol of Warrior (5 adet)', 499], ['2000 Health+ Scroll', 249], ['Scroll of Armor 350', 249], ['Symbol of Warrior (10 adet)', 769], ['Merchant Concentration', 159], ['Symbol of Growth', 249], ['Lesson of Master', 859], ['Blue Potion', 9], ['Prayer of Priest', 249], ['Spirit Potion (300) + Punishment Stick', 1299], ['War Tattoo Voucher (30 gün)', 249]],
  'Ekipman, Pet & Görünüm': [["Dragon's Wing", 899], ['Voucher for a Pathos Glove', 249], ['Voucher for Automatic Pet Looting', 248], ['Cuff Binder Pet', 299], ['Pathos Package', 479], ['Giga Hammer Pet', 349], ['Krowaz Pet', 499], ['Oreads Voucher (30 gün)', 699], ['Menissiah Transform Scroll (Karus)', 249], ['Menissiah Transform Scroll (El Morad)', 249], ['Hera Transform Scroll (Karus)', 249], ['Hera Transform Scroll (El Morad)', 249], ['Patrick Transform Scroll (Karus)', 149], ['Patrick Transform Scroll (El Morad)', 149], ['Cougar Transform Scroll (Karus)', 149], ['Cougar Transform Scroll (El Morad)', 149], ['Appearance Change', 125], ['Yeniçeri Armor', 429], ['Valkyrie Helmet Certificate', 349], ['Valkyrie Armor Certificate', 429], ['Gryphon Helmet Certificate', 349], ['Gryphon Armor Certificate', 429], ['Yeniçeri Helmet', 349], ['Crisis (El Morad)', 289], ['Bahamut Armor Certificate', 429], ['Bahamut Helmet Certificate', 349], ['Ibex (Karus)', 289], ['Minerva Package', 729], ['Magpie (El Morad)', 289], ['Magpie (Karus)', 289], ['Von Eblis Pet', 349], ['Astarod Pet', 349], ['Pidama Pet', 499], ['Nereids Voucher', 149], ['Special Nereids (Defence) Voucher', 1590], ['Special Nereids (Attack) Voucher', 1590]],
  'Hizmet & Diğer': [["Trina's Piece", 800], ['Genie Hammer', 99], ['Clan Name Change Scroll', 399], ['Gender Change', 749], ['Menissiah Official List Coupon (30 gün)', 360], ['Clan Contribution Certificate (+0)', 1040], ['Rebirth Restoration Scroll', 249], ['Accessory Disassemble Scroll', 249], ["Kaishan's Trade Certificate", 399], ['Name Change Scroll', 2000], ['Tears of Karivdis', 400], ['Teleportation Item', 99], ['Duration Item', 59], ['Voucher for Magic Bag', 89], ['Character Seal Scroll', 2800], ['Chaos Map Coupon', 35], ['Ancient Text', 25], ['Nation Transfer', 1599], ['Familiar Name Change', 349], ['NP increase item', 799], ['Hyper Noah Scroll', 149], ['VIP Vault Key (30 gün)', 349], ['Arrange Line', 349], ['Seal Exchange Voucher', 79], ['Medium Level Seal Exchange', 379], ['Spirit of Genie (10 adet)', 149]],
};
function defaultPusCatalog() {
  const out = []; let n = 0;
  for (const [cat, items] of Object.entries(PUS_DEFAULT)) for (const [name, kc] of items) out.push({ id: 'p' + (n++), cat, name, kc });
  return out;
}

// "Bir sonraki seviyeye geçmek için gereken EXP" (seviye 1–82)
const EXP_REQ = [100, 250, 500, 900, 1500, 2400, 3700, 5500, 8000, 11000, 15000, 20000, 27000, 36000, 48000, 63000, 82000, 106000, 136000, 174000, 220000, 280000, 352000, 440000, 550000, 680000, 840000, 1030000, 1260000, 1540000, 1870000, 2270000, 2740000, 3300000, 3960000, 4740000, 5660000, 6740000, 8000000, 9500000, 11200000, 13200000, 15500000, 18200000, 21300000, 24900000, 29000000, 33800000, 39300000, 45600000, 52800000, 61100000, 70600000, 81500000, 94100000, 108500000, 125000000, 144000000, 166000000, 191000000, 220000000, 253000000, 291000000, 335000000, 385000000, 443000000, 509000000, 585000000, 672000000, 773000000, 889000000, 1020000000, 1170000000, 1350000000, 1550000000, 1780000000, 2050000000, 2350000000, 2700000000, 3100000000, 3560000000, 4090000000];
function defaultExpTable() {
  const t = {};
  EXP_REQ.forEach((v, i) => { t[i + 1] = v; });
  return t;
}

/* USKO etkinlik takvimi (Türkiye saati) — Ekim 2026.
   Kaynaklar: ucuzagb.com (12.10.2026), knightpin.com (15.10.2026), korehberi.com.
   Günler: 0=Pazar … 6=Cumartesi. Saatler bakım/özel dönemlerde değişebilir. */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const USKO_EVENTS = [
  { pid: 'cz', name: 'Chaos Dungeon (CZ)', days: ALL_DAYS, times: ['00:00', '12:00'], dur: 30, color: '#a58bff', note: '' },
  { pid: 'bdw', name: 'Border Defense War (BDW)', days: ALL_DAYS, times: ['02:00', '13:00', '19:00'], dur: 30, color: '#ef5b5b', note: 'Mavi sandık için 83/3' },
  { pid: 'bif', name: 'Bifrost', days: ALL_DAYS, times: ['02:00', '14:00', '21:00'], dur: 120, color: '#5aa7ff', note: '30 dk anıtı kıran taraf + 90 dk herkese açık. 14:00 tek kaynakta eksik' },
  { pid: 'ft', name: 'Forgotten Temple (FT)', days: ALL_DAYS, times: ['03:00', '22:00'], dur: 30, color: '#e3b554', note: 'Min. 46 (46–59 / 60–83)' },
  { pid: 'jr', name: 'Juraid Mountain (JR)', days: ALL_DAYS, times: ['07:40', '22:40'], dur: 35, color: '#3ec27a', note: 'Min. 70' },
  { pid: 'krw', name: 'Krowaz', days: ALL_DAYS, times: ['10:00', '21:00'], dur: 30, color: '#ff9f5a', note: 'Bir kaynakta sabit saatsiz geçiyor' },
  { pid: 'lw', name: 'Lunar War', days: [1, 6], times: ['14:00', '20:00'], dur: 60, color: '#5aa7ff', note: 'Pazartesi ve Cumartesi' },
  { pid: 'utc', name: 'Under The Castle (UTC)', days: [5], times: ['21:00'], dur: 60, color: '#a58bff', note: 'Min. 75' },
  { pid: 'csw', name: 'Castle Siege War (CSW)', days: [0], times: ['20:30'], dur: 60, color: '#ef5b5b', note: '' },
  { pid: 'manes', name: "Manes'in Arenası", days: ALL_DAYS, times: ['16:00', '21:20'], dur: 10, color: '#3ec27a', note: '10 dk Apply penceresi · 12 Kasım 2026\'ya kadar', until: '2026-11-12' },
  { pid: 'bakim', name: 'Sunucu bakımı', days: [4], times: ['04:00'], dur: 120, color: '#6c7685', note: 'Süre değişir' },
];
const USKO_EVENTS_INFO = 'USKO takvimi · Ekim 2026 · kaynak: ucuzagb.com, knightpin.com, korehberi.com';

/* Karakter seçenekleri */
const NATIONS = { karus: { label: 'Karus', color: '#e05252' }, human: { label: 'Human (El Morad)', color: '#4f8fe8' } };
const CLASSES = {
  warrior: { label: 'Warrior', color: '#ef5b5b' },
  rogue: { label: 'Rogue', color: '#3ec27a' },
  mage: { label: 'Mage', color: '#a58bff' },
  priest: { label: 'Priest', color: '#e3b554' },
  kurian: { label: 'Kurian / Porutu', color: '#ff9f5a' },
};
// Irk seçimi: ulusa göre tüm ırklar sunulur (Kurian/Porutu sınıfı kendi ırkıyla gelir)
const RACES = {
  karus: ['Arch Tuarek', 'Tuarek', 'Wrinkle Tuarek', 'Puri Tuarek'],
  human: ['Barbarian', 'El Morad (Erkek)', 'El Morad (Kadın)'],
};
const RACE_DEFAULT = { karus: { warrior: 'Arch Tuarek', rogue: 'Tuarek', mage: 'Wrinkle Tuarek', priest: 'Tuarek' }, human: { warrior: 'Barbarian', rogue: 'El Morad (Erkek)', mage: 'El Morad (Erkek)', priest: 'El Morad (Erkek)' } };
const raceOptions = (nation, cls) => cls === 'kurian' ? [nation === 'human' ? 'Porutu' : 'Kurian'] : RACES[nation] || [];
const classLabel = (cls, nation) => cls === 'kurian' ? (nation === 'human' ? 'Porutu' : 'Kurian') : (CLASSES[cls] || {}).label || cls;
const DEFAULT_SERVERS = ['Zero', 'Felis', 'Agartha', 'Pandora', 'Dryads', 'Destan', 'Minark', 'Oreads'];

/* PUS item ikonları: katalogla aynı sırada (p0…p108), kaynak sitenin /img/pus/ klasörü */
const PUS_ICONS = ('exp dc war platinum gold bronze switch ' +
  'lion lion str str hp hp dex dex int int mp mp redistribution hpmaestro mpmaestro ' +
  'res80 def150 1500 hp1000 hp500 300 def150 swift attack 60reco gladiator gladiator gladiator warrior warrior 2000 350 warrior merchant growth lesson bluepotion book spiritpunish wartattoo ' +
  'dragonwing pathos autoloot cuff dualpathos giga krowaz oreads meni-karus meni-elmo hera-karus hera-elmo patrick-karus patrick-elmo cougar-karus cougar-elmo appearance yeniceri-armor valk-helm valk-armor gryphonhelmet gryphonarmor yeniceri-helmet crisis bahamut-armor bahamut-helm ibex minerva magpie magpie eblis astarod pidama nereids nereid-def nereid-atk ' +
  'trina geniehammer clanname gender meni clancontrib rebirthreverse accdisa kaishan ncs karivdis teleport durat magicbag characterseal chaos ancient nts familiar npinc noah vip arrange SealExc mSealExc genie').split(' ');
