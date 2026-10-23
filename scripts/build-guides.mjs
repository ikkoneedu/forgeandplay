// Tanıtım sitesindeki /event-rehberi sayfasını uygulamadaki rehber verisinden üretir.
// Kullanım: node scripts/build-guides.mjs   (veri: public/kohesap-app/guide-data.js · şablon: public/site/exp-tablosu.html)
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { EVENT_GUIDES, EVENT_GUIDES_AT, EVENT_GUIDES_DATE } = createRequire(import.meta.url)(join(root, 'public/kohesap-app/guide-data.js'));
const USKO = (() => { // takvim saatleri data.js'ten (USKO_EVENTS)
  const src = readFileSync(join(root, 'public/kohesap-app/data.js'), 'utf8');
  const m = /const ALL_DAYS = [^;]+;\s*const USKO_EVENTS = (\[[\s\S]*?\n\]);/.exec(src);
  return Function('ALL_DAYS', 'return ' + m[1])([0, 1, 2, 3, 4, 5, 6]);
})();
const tpl = readFileSync(join(root, 'public/site/exp-tablosu.html'), 'utf8');
const URL = 'https://forgeandplay.com/event-rehberi';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const when = pid => {
  const e = USKO.find(x => x.pid === pid); if (!e) return '';
  const d = e.days.length === 7 ? 'Her gün' : e.days.map(x => DAYS[x]).join(' ve ');
  return `${d} ${e.times.join(', ')}`;
};

const title = 'Knight Online Event Rehberi 2026: BDW, JR, FT, Chaos, Lunar, UTC, CSW';
const desc = 'Knight Online eventleri tek sayfada: seviye şartı, nasıl girilir, nasıl kazanılır, ödüller, saatler ve ipuçları. Border Defense War, Juraid, Forgotten Temple, Chaos, Bifrost, Lunar War, Under The Castle, Castle Siege.';
const faq = [
  ['BDW kaç seviyede girilir?', `${EVENT_GUIDES.find(g => g.pid === 'bdw').lv} seviye arası. Ödül seviyeye göre değişir: 81–83 Blue, 69–80 Green Treasure Chest.`],
  ['Juraid Mountain nasıl kazanılır?', EVENT_GUIDES.find(g => g.pid === 'jr').kazan],
  ['Forgotten Temple ödülü neye göre verilir?', 'Verdiğin hasara göre: yüksek hasar verenler yeşil, düşük hasar verenler kırmızı sandık alır. 46–59 ve 60–83 seviye için ayrı açılır.'],
  ['Event saatleri nereden takip edilir?', 'KO Ekip\'in Event Takvimi sayfası haftalık saatleri gösterir, sıradaki event için geri sayım yapar ve telefonuna bildirim gönderir. Ekip Planı ile ekibinden kimin geleceğini önceden görürsün.'],
];
const card = g => `<article class="card ev-card" id="${g.slug}">
      <div class="ev-h"><span class="ev-k">${esc(g.k)}</span><div><h2>${esc(g.n)}</h2><p class="muted">${esc(g.tur)}</p></div></div>
      <ul class="ev-meta"><li><b>Seviye</b>${esc(g.lv)}</li><li><b>Süre</b>${esc(g.sure)}</li>${when(g.pid) ? `<li><b>Saat (USKO)</b>${esc(when(g.pid))}</li>` : ''}</ul>
      <p>${esc(g.ozet)}</p>
      <h3>Nasıl girilir</h3><p>${esc(g.giris)}</p>
      <h3>Nasıl kazanılır</h3><p>${esc(g.kazan)}</p>
      <h3>Ödüller</h3><ul>${g.odul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>İpuçları</h3><ul>${g.ipucu.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${g.fark ? `<p class="ev-warn"><b>Dikkat:</b> ${esc(g.fark)}</p>` : ''}
    </article>`;

const main = `<main id="ana">
<div class="wrap page">
  <nav class="crumb" aria-label="breadcrumb"><a href="/?tanitim">KO Ekip</a> / Event Rehberi</nav>
  <h1>Knight Online event rehberi</h1>
  <p class="lead">Her event için seviye şartı, nasıl girildiği, nasıl kazanıldığı, ödüller ve ipuçları. Saatler USKO (Türkiye) takvimine göredir; bakım ve özel dönemlerde değişebilir.</p>
  <div class="toc">${EVENT_GUIDES.map(g => `<a href="#${g.slug}">${esc(g.k)}</a>`).join('')}</div>
  <div class="side-cta"><div><b>Eventi ekibinle planla</b><span>KO Ekip'te event saatine plan aç; ekibin "geliyorum" desin, başlamadan önce telefonuna hatırlatma gelsin.</span></div><a class="btn pri" href="/app?p=rehber">Uygulamada aç</a></div>
  <div class="ev-grid">
    ${EVENT_GUIDES.map(card).join('\n    ')}
  </div>
  <p class="muted" style="font-size:13.5px;margin-top:18px">Bilgiler ${esc(EVENT_GUIDES_AT)} itibarıyla resmî duyurular ve topluluk rehberlerinden derlenmiştir. Kaynakların ayrıştığı yerler "Dikkat" notunda belirtilmiştir; oyun içi duyuru her zaman önceliklidir.</p>
  <div class="prose">
    <h2>Sık sorulanlar</h2>
    <div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
  </div>
</div></main>`;

const ld = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': 'https://forgeandplay.com/#org', name: 'Forge & Play', url: 'https://forgeandplay.com/', logo: 'https://forgeandplay.com/site/icon-512.png', email: 'info@forgeandplay.com', brand: { '@type': 'Brand', name: 'KO Ekip' } },
  { '@type': 'WebSite', '@id': 'https://forgeandplay.com/#site', url: 'https://forgeandplay.com/', name: 'KO Ekip', inLanguage: 'tr-TR', publisher: { '@id': 'https://forgeandplay.com/#org' } },
  { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'KO Ekip', item: 'https://forgeandplay.com/' }, { '@type': 'ListItem', position: 2, name: 'Event Rehberi', item: URL }] },
  { '@type': 'Article', headline: title, description: desc, url: URL, inLanguage: 'tr-TR', author: { '@id': 'https://forgeandplay.com/#org' }, publisher: { '@id': 'https://forgeandplay.com/#org' }, dateModified: EVENT_GUIDES_DATE, image: 'https://forgeandplay.com/site/og.jpg' },
  { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
] };

let html = tpl
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*"/g, `$1${esc(desc)}"`)
  .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*"/g, `$1${esc(title)}"`)
  .replace(/https:\/\/forgeandplay\.com\/exp-tablosu/g, URL)
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
  .replace(/<main id="ana">[\s\S]*?<\/main>/, main);
if (/exp-tablosu"|EXP tablosu \(1–83\)<\/h1>/.test(html.replace(/href="\/exp-tablosu"/g, ''))) throw new Error('şablon değişimi eksik');
writeFileSync(join(root, 'public/site/event-rehberi.html'), html);
console.log('public/site/event-rehberi.html yazıldı ·', EVENT_GUIDES.length, 'event');
