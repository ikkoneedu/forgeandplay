'use strict';
/* ==========================================================================
   EVENT REHBERİ — veri (uygulama ve tanıtım sitesindeki /event-rehberi sayfası bu dosyadan üretilir)
   pid: data.js → USKO_EVENTS ile aynı kimlik. Yalnızca birden fazla kaynağın uyuştuğu bilgiler
   yazılır; kaynakların ayrıştığı yerler "fark" alanında açıkça belirtilir.
   Kaynaklar (Ekim 2026 taraması): korehberi.com, nttgame.com (resmî), kofarmanaliz.com,
   sivri.org, kobugda.com, ucuzagb.com, knightpin.com, frmtr.com, turkmmo.com.
   Site sayfasını yeniden üretmek için: node scripts/build-guides.mjs
   ========================================================================== */
const EVENT_GUIDES_AT = 'Ekim 2026';
const EVENT_GUIDES = [
  {
    pid: 'bdw', n: 'Border Defense War', k: 'BDW', slug: 'border-defense-war', tur: 'PvP · 8v8',
    lv: '20–83', sure: '30 dk',
    ozet: 'Karus ve El Morad\'dan sekizer kişilik iki takımın kapıştığı sınır savaşı. Ortadaki kristalden alınan bayrağı kendi tarafına taşıyan ve düşman öldüren takım puan toplar.',
    giris: 'Saat gelince ekranın üst ortasında katılım penceresi çıkar; tıklaman yeterli, NPC\'ye gitmen gerekmez.',
    kazan: 'İlk 600 puana ulaşan ya da rakip takımda oyuncu bırakmayan taraf kazanır. 30 dakika dolarsa puanı yüksek olan kazanır. Puan: düşman öldürmek ve Altar of Manes\'ten alınan Shard of Manes bayrağını kendi bölgene götürmek.',
    odul: ['20–50 seviye: Abyss Gem', '51–57: Monster Stone + Red Treasure Chest', '58 ve üstü: Red Treasure Chest', '69–80: Green Treasure Chest', '81–83: Blue Treasure Chest', 'Kaybeden taraf da EXP alır; premium daha fazla alır'],
    ipucu: ['Bayrak puanı öldürmekten değerlidir: bayrağı taşıyan oyuncuyu koru.', 'Takımda en az bir Priest olsun; 8v8\'de iyileştirme maçı çevirir.', '58. seviyeden itibaren ölmek NP kaybettirir; gereksiz ölmekten kaçın.'],
    fark: 'Seviye sınırı 2022\'de 83\'e çıkarıldı; kalıcı olup olmadığını oyun içi duyurudan kontrol et. Rakipsiz kazanılan maçta sandık verilmediğini yazan kaynak var.',
  },
  {
    pid: 'cz', n: 'Chaos Dungeon', k: 'CZ', slug: 'chaos-dungeon', tur: 'PvP · herkes herkese karşı',
    lv: 'Şart yok', sure: '20 dk savaş',
    ozet: 'Herkesin herkese karşı savaştığı kapalı arena. Süre boyunca yaptığın öldürmelere göre sıralamaya girersin.',
    giris: 'Etkinlik saatinde katılım duyurusuyla girilir.',
    kazan: 'Süre sonunda en çok öldürme yapanlar sıralamanın üstüne çıkar.',
    odul: ['Sıralamaya göre kırmızı, yeşil ya da mavi sandık'],
    ipucu: ['Kalabalığın ortasına dalma; kenardan canı azalmış rakipleri hedefle.', 'Can ve mana iksirlerini girmeden hazırla.'],
  },
  {
    pid: 'jr', n: 'Juraid Mountain', k: 'JR', slug: 'juraid-mountain', tur: 'PvP + boss · 8v8',
    lv: '70+', sure: '35–50 dk',
    ozet: 'İki ırkın sekizer kişiyle girdiği dağ savaşı. Amaç rakipten önce Deva Bird\'ü öldürmek.',
    giris: 'Eslant\'taki Reserve Knight Captain Rugur (Karus) ya da Belldan (El Morad) NPC\'sinden kayıt olunur.',
    kazan: 'Deva Bird\'ü öldüren ırk kazanır. Boss süre içinde ölmezse karşı ırkı en çok öldüren ırk kazanır.',
    odul: ['Canavarlardan gem düşer', 'Deva Bird ölünce Silvery Gem, Silver Bar ve Gold Bar şansı'],
    ipucu: ['Kayıt kontenjanı dolabilir: saatten önce NPC başında ol.', 'Rakip ırkın Deva Bird\'e yaklaşmasını engelle; boss\'u kesen taraf kazanır.'],
    fark: 'Süre bir kaynakta 35, diğerlerinde 50 dakika. STKO\'da saatler farklı (02:40 ve 13:40).',
  },
  {
    pid: 'ft', n: 'Forgotten Temple', k: 'FT', slug: 'forgotten-temple', tur: 'PvE',
    lv: '46–59 ve 60–83 (iki ayrı bant)', sure: '30 dk',
    ozet: 'Seviye bandına göre ayrı ayrı açılan, canavarlara karşı oynanan tapınak etkinliği. Ödül verdiğin hasara göre belirlenir.',
    giris: 'Moradon\'daki Priest Iris NPC\'si. Kontenjan dolabildiği için NPC başında beklemek gerekir.',
    kazan: 'Rakip ırk yok; ne kadar çok hasar verirsen ödülün o kadar iyi olur.',
    odul: ['Yüksek hasar verenler yeşil sandık, düşük hasar verenler kırmızı sandık alır'],
    ipucu: ['Girmeden buff ve hasar scroll\'larını kullan; ödül hasara bağlı.', 'Erken git; kontenjan dolunca giremezsin.'],
  },
  {
    pid: 'bif', n: 'Bifrost', k: 'BIF', slug: 'bifrost', tur: 'Irk savaşı + PvE',
    lv: 'Belirtilmiyor', sure: '120 dk (30 + 90)',
    ozet: 'Ronark Land\'deki anıtı kıran ırkın önce girdiği, fragment düşüren canavarlarla dolu bölge.',
    giris: 'Ronark Land\'deki anıt kırılarak girilir. İlk 30 dakika anıtı kıran ırka, sonraki 90 dakika herkese açıktır.',
    kazan: 'Anıtı kıran ırk ilk 30 dakikayı tek başına kullanır.',
    odul: ['İçeride 7 farklı canavar vardır; her biri kendi fragment türünü düşürür (her öldürmede düşmez)'],
    ipucu: ['Anıtı kırmak için ırkınla birlikte toplan; ilk 30 dakika en verimli kısımdır.', 'İhtiyacın olan fragment türüne göre hedef canavarı seç.'],
    fark: '14:00 seansı bir kaynakta oyunun kendi takviminde görünmüyor.',
  },
  {
    pid: 'krw', n: 'Krowaz', k: 'KRW', slug: 'krowaz', tur: 'PvE · boss',
    lv: 'Belirtilmiyor', sure: '30 dk',
    ozet: 'Boss\'ların bulunduğu PvE bölgesi. Boss\'lardan düşen itemler üretim (crafting) sisteminde kullanılır.',
    giris: 'Etkinlik saatinde bölgeye girilir.',
    kazan: 'Rakip ırk yok; boss\'ları kesip düşüşleri toplarsın.',
    odul: ['Üretim sisteminde kullanılan boss düşüşleri'],
    ipucu: ['Boss\'lara parti halinde git; düşüşleri Parti & Drop\'a yazıp adil paylaş.'],
    fark: 'Bir kaynakta sabit saatsiz geçiyor; saatleri oyun içinden doğrula.',
  },
  {
    pid: 'lw', n: 'Lunar War', k: 'LW', slug: 'lunar-war', tur: 'PvP · ırk savaşı',
    lv: '35+ (bazı kaynaklarda 30+)', sure: '60 dk',
    ozet: 'Lunar Valley\'de iki ırkın, her ırktan ilk 200 kişiyle girdiği büyük savaş. Düşmanın üç NPC\'sini düşüren ırk karşı ülkeye istilaya gider.',
    giris: 'Moradon\'daki Warp Gate ile Lunar Valley\'e geçilir. Her ırktan ilk 200 kişi katılabilir.',
    kazan: 'Düşmanın Warder 1, Warder 2 ve Keeper NPC\'lerini öldürmek savaşı bitirir. Süre dolarsa iki ırkın puanı karşılaştırılır.',
    odul: ['Kazanan ırk Victory Gate ile karşı ırkın ülkesine istilaya gider', 'Warder\'a en çok hasar veren oyuncu ve partisi NP kazanır', 'Düşman öldürmek NP kazandırır, ölmek kaybettirir'],
    ipucu: ['Sıra: önce iki Warder, sonra Keeper.', 'Savaşın 10. dakikasında en çok NP\'li 5 klanın lideri komutan olur; komutanın çağrısını takip et.', 'NP\'n 0 ise ölünce %1 EXP kaybedersin.'],
    fark: 'Dark Lunar War aynı kurallarla 35–59 (bazı kaynaklarda 30–59) seviyeye açıktır; günleri kaynaklara göre değişir.',
  },
  {
    pid: 'utc', n: 'Under The Castle', k: 'UTC', slug: 'under-the-castle', tur: 'PvE · zindan',
    lv: '75+', sure: 'Cuma 21:00 (resmî: 21:00–01:00)',
    ozet: 'Kalenin altındaki, yaratık ve boss\'larla dolu haftalık zindan. Değerli düşüşleri ve yüksek EXP\'li görevleri vardır.',
    giris: 'Luferson Castle ya da El Morad Castle\'daki [Twilight Observer] Eyre NPC\'si.',
    kazan: 'Rakip ırk yok; yaratık ve boss\'ları kesip görevleri tamamlarsın.',
    odul: ['Yaratık ve boss\'lardan değerli itemler, Trophy Flame Box', 'King of Kings görevi 25.000.000 EXP', 'Başarı (achievement) görevleri ve unvanlar (ör. Castle King)'],
    ipucu: ['Tam parti gir; boss\'lar tek başına kesilmez.', 'Ekip Planı\'ndan Cuma için plan aç; kimin geleceği önceden belli olsun.'],
    fark: 'STKO\'da Cumartesi 16:00. Eski forumlardaki 35 seviye bilgisi güncel değil.',
  },
  {
    pid: 'csw', n: 'Castle Siege War', k: 'CSW', slug: 'castle-siege-war', tur: 'Klan savaşı',
    lv: 'Klan etkinliği', sure: '60 dk',
    ozet: 'Klanların Delos kalesi için savaştığı haftalık kuşatma. Oyunun en büyük etkinliğidir.',
    giris: 'Klanınla birlikte savaş saatinde Delos\'a git.',
    kazan: 'Kaleyi alan ve tutan klan kazanır. Klan Deathmatch sıralaması ayrıca ödüllendirilir.',
    odul: ['Kaleyi tutan klan Delos ve Moradon vergilerini toplar, Castellan silahlarına erişir', 'Deathmatch\'te ilk 5 klan: Siege War Reward Chest ve New Cape Voucher (Moradon\'daki [CSW Manager] Aaron)'],
    ipucu: ['Klan olarak toplan; dağınık giren klan kaleyi tutamaz.', 'Ekip Planı\'ndan Pazar için plan açıp katılımı önceden topla.'],
    fark: 'Bazı eski kaynaklarda Cumartesi 14:00 geçiyor; güncel saat Pazar 20:30.',
  },
  {
    pid: 'manes', n: 'Manes\'in Arenası', k: 'Manes', slug: 'manes-arenasi', tur: 'Dönemsel arena',
    lv: 'Belirtilmiyor', sure: '10 dk başvuru penceresi',
    ozet: 'Belirli bir dönem açık olan arena etkinliği. Başvuru, etkinlik saatinde açılan 10 dakikalık pencerede yapılır.',
    giris: 'Etkinlik saatinde açılan 10 dakikalık Apply (başvuru) penceresinden.',
    kazan: 'Ayrıntılar oyun içi duyuruda.',
    odul: ['Oyun içi duyuruya bak'],
    ipucu: ['Başvuru penceresi yalnızca 10 dakika açık; hatırlatmayı aç.'],
    fark: '12 Kasım 2026\'ya kadar açık.',
  },
];
const guideByPid = pid => EVENT_GUIDES.find(g => g.pid === pid) || null;
/** Takvimdeki bir event için rehber: önce pid, yoksa addaki kısaltma ya da tam ad */
function guideFor(e) {
  if (!e) return null;
  if (e.pid && guideByPid(e.pid)) return guideByPid(e.pid);
  const n = String(e.name || e.t || '').toLocaleLowerCase('tr');
  return EVENT_GUIDES.find(g => n.includes(g.n.toLocaleLowerCase('tr')) || new RegExp('\\(' + g.k.toLocaleLowerCase('tr') + '\\)').test(n)) || null;
}
if (typeof module !== 'undefined') module.exports = { EVENT_GUIDES, EVENT_GUIDES_AT };
