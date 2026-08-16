# Forge&Play — Ana Yol Haritası (v3, eksiksiz)

> **AI destekli oyun arkadaşı platformu + anında oynanan oyun portalı.**
> Domain: forgeandplay.com · Stack: Next.js + Firebase + Vercel + GitHub + Claude AI
> **1 numaralı öncelik: SEO ile organik kullanıcı kazanımı** (bkz. Bölüm 4).

---

## 0. Vizyon & Konumlandırma
Steam/Epic/Xbox/PS5/PC oyuncularının **yapay zeka ile saniyeler içinde uyumlu takım arkadaşı** bulduğu; bu arada **her yaşa uygun, indirmesiz tarayıcı oyunlarını anında oynadığı**; canlı **sohbet** ettiği tek platform.

**Tek cümlelik konum:** "Discord'un dağınıklığı yok, forum aramanın zahmeti yok — AI sana %90+ uyumlu ekibi kurar, oyunlar hep bir tık ötede."

**Kuzey yıldızı metrik:** organik (SEO) günlük ziyaretçi → kayıt → kurulan takım / oynanan oyun → geri dönüş (D1/D7).

---

## 1. Neden Eşsiz (rakiplerden farkımız)
- **AI Akıllı Eşleştirme** — sadece liste değil, uyum skoruyla öneri (rakipler manuel LFG panosu)
- **İki dünya bir arada** — LFG + anında oyun portalı → hem "arkadaşımla oynayacağım" hem "canım sıkıldı" trafiğini yakalar (SEO'da iki dev anahtar kelime havuzu)
- **AI moderasyon** — toksik olmayan, güvenli topluluk (bu sektörün en büyük acısı)
- **SEO-first mimari** — her oyun ve her "oyun arkadaşı" niyeti ayrı, çok dilli, yapısal veriyle işaretli indekslenebilir sayfa

---

## 2. Teknik Stack (kilitli)
- **Next.js 15 (App Router) + TypeScript** — SSR/SSG/ISR (SEO'nun temeli)
- **Tailwind CSS + shadcn/ui + Framer Motion** — onaylı sinematik/3D tasarım dili
- **Firebase** — Auth (Google + Steam OpenID + e-posta) · Firestore (realtime: LFG + sohbet) · Storage · Cloud Functions
- **Vercel** — hosting + domain + Edge Network (CDN) + Cron + ISR
- **Claude AI (Anthropic API)** — eşleştirme, moderasyon, asistan, çok dilli içerik/çeviri
- **next-intl** — 4 dilli i18n + hreflang
- **next/og** — sayfa başına dinamik OG görseli
- Analitik: **GA4 + Google Search Console + Vercel Analytics** (+ opsiyonel Plausible)

---

## 3. Bilgi Mimarisi & URL Yapısı (SEO'nun iskeleti)
Temiz, anahtar-kelime içeren, dile göre yerelleştirilmiş URL'ler:
```
/{locale}/                         → ana sayfa
/{locale}/oyunlar                  → oyun portalı vitrini (kategori/filtre)
/{locale}/oyna/{oyun-slug}         → tek oyun sayfası (oynanabilir + SEO içerik)
/{locale}/lfg                      → LFG merkezi
/{locale}/lfg/{oyun-slug}          → "X oyun arkadaşı bul" hub (programatik SEO)
/{locale}/lfg/{oyun-slug}/{oda-id} → tek oda (canlı; ince içerik → noindex)
/{locale}/turnuvalar               → turnuva listesi
/{locale}/turnuva/{slug}           → tek turnuva (Event schema)
/{locale}/rehber/{slug}            → blog/rehber (uzun kuyruk SEO)
/{locale}/oyuncu/{kullanici}       → herkese açık profil (indexlenir)
```
- locale örnekleri: `/tr /en /es /zh`
- Slug'lar **her dilde yerelleştirilmiş** (ör. `/en/play/...`, `/es/jugar/...`) — kararı Faz 1'de netleştir; başta ortak İngilizce slug + yerel meta da olur.
- Kanonik + hreflang her sayfada.

---

## 4. 🔍 SEO — DERİN STRATEJİ (bir numaralı sütun)

### 4.1 Teknik SEO (altyapı)
- **Render:** her indekslenecek sayfa SSG veya ISR ile önceden render (JS'e bağımlı gizli içerik yok). Kullanıcıya özel/ince sayfalar `noindex`.
- **`app/robots.ts`** — dinamik robots.txt, sitemap referansı.
- **`app/sitemap.ts`** — dinamik, **segmentli sitemap index** (oyunlar / lfg / rehber / turnuva ayrı; her dosya <50k URL). Yeni oyun/rehber otomatik girer.
- **Kanonik etiketler** — kopya içerik yok; filtre/sıralama parametreleri kanonike işaret eder.
- **hreflang** — 4 dil + `x-default`, çift yönlü tutarlı.
- **`generateMetadata`** — her rota için başlık/açıklama/OG/twitter, anahtar kelime niyetine göre.
- **Temiz durum kodları** — 301 kalıcı yönlendirmeler, 404/410 doğru; soft-404 yok.
- **Sayfalama** — sonsuz kaydırmada bile taranabilir sayfalı URL'ler.
- **İnce/kopya içerik yönetimi** — boş LFG odaları, filtre kombinasyonları `noindex, follow`.
- **Mobil-öncelikli indeksleme** — tasarım zaten responsive; tam eşdeğer içerik.

### 4.2 Programatik SEO (ölçek — asıl trafik motoru)
Matris: **oyun × niyet × dil** = binlerce benzersiz, değerli sayfa.
- **Niyetler (TR örnek):** "{oyun} oyun arkadaşı", "{oyun} takım arkadaşı bul", "{oyun} duo/partner ara", "{oyun} discord alternatifi", "{oyun} online oyna", "ücretsiz {kategori} oyunları".
- Her hub sayfası: canlı oda listesi + **benzersiz AI üretimli açıklama** (o oyuna özel: nasıl takım bulunur, popüler modlar, ipuçları) + SSS + iç bağlantılar. **Şablon-kopya değil**, her oyun için özgün.
- 4 dile **AI çeviri + yerelleştirme** (birebir çeviri değil, o pazara uygun).
- İç bağlantı: hub↔oyun↔rehber↔turnuva (hub-and-spoke).

### 4.3 Yapısal Veri (Rich Results / JSON-LD)
- **Organization** + **WebSite** (Sitelinks Searchbox ile site içi arama)
- **VideoGame** (her oyun: tür, platform, oyun modu, AggregateRating)
- **BreadcrumbList** (her derin sayfa)
- **FAQPage** (hub + rehber sayfaları → SERP'te açılır cevaplar)
- **Event** (turnuvalar → Google Etkinlik sonuçları)
- **VideoObject / ImageObject** (fragman/kapak varsa)
- Tümü CI'da **schema validation**'dan geçer.

### 4.4 Çok Dilli SEO
- 4 dil ayrı indekslenir, hreflang ile birbirine bağlı, her dil için **yerel anahtar kelime araştırması** (tr/en/es/zh niyet farklı).
- Dil değiştirici gerçek `<a href>` (JS-only değil) → taranabilir.

### 4.5 Performans / Core Web Vitals (sıralama faktörü + dönüşüm)
- Hedef: **LCP < 2.5s, INP < 200ms, CLS < 0.1** (mobilde dahil).
- **next/image** (AVIF/WebP, boyut/priority), hero görselleri `priority`, gerisi lazy.
- **Font**: self-host / `next/font` (CDN yok), `font-display:swap`, CLS önleme.
- **Edge caching + ISR** (Vercel CDN), kod bölme, gereksiz JS'i istemciden uzak tut (RSC).
- Animasyonlar `transform/opacity` ile (layout thrash yok), `prefers-reduced-motion`.
- **Lighthouse CI** pipeline'da eşik altına düşerse build uyarısı.

### 4.6 İçerik / Editoryal SEO (uzun kuyruk + otorite)
- **Rehber/blog motoru** (`/rehber/*`): "En iyi ücretsiz {kategori} oyunları 2026", "{oyun} rütbe sistemi", "{oyun} takım nasıl kurulur", meta/patch haberleri.
- AI taslak + insan editü → E-E-A-T (özgünlük, doğruluk).
- Yayın takvimi (haftalık), güncel tutma (freshness).
- Her rehber ilgili hub/oyunlara iç bağlantı.

### 4.7 Off-Page & Otorite (backlink + sosyal sinyal)
- **Üründe gömülü paylaşım**: skor kartı / "takımım kuruldu" kartı → sosyal medyada paylaşılabilir görsel (next/og) → geri bağlantı + referans trafik.
- Reddit (r/lfg, oyun subreddit'leri), Discord toplulukları, oyun forumları, dizinler.
- Steam/oyun topluluklarıyla organik etkileşim.
- Basın/duyuru: "AI ile takım eşleştiren TR platformu".

### 4.8 Ölçüm & Araçlar (ilk gün kurulacak)
- **Google Search Console** + **Bing Webmaster** (sitemap gönder, kapsam izle)
- **GA4** + **Vercel Analytics** (Web Vitals gerçek kullanıcı verisi)
- **Sıralama takibi** (anahtar kelime), **schema test**, **Lighthouse CI**
- Aylık SEO panosu: indekslenen sayfa, gösterim, tıklama, ortalama sıra, CWV.

### 4.9 Next.js SEO Uygulama Kontrol Listesi (koda döküleceğinde)
- [ ] `app/robots.ts` + `app/sitemap.ts` (segmentli)
- [ ] Route bazlı `generateMetadata` (title/desc/OG/twitter/canonical)
- [ ] `generateStaticParams` ile programatik hub/oyun sayfaları (ISR revalidate)
- [ ] JSON-LD bileşenleri (Organization/WebSite/VideoGame/Breadcrumb/FAQ/Event)
- [ ] hreflang + canonical helper
- [ ] `next/og` dinamik OG görsel route'ları
- [ ] `next/font` self-host, `next/image` her yerde
- [ ] Semantik HTML + doğru başlık hiyerarşisi + breadcrumb
- [ ] İnce sayfalarda `noindex` mantığı
- [ ] Lighthouse CI + schema validation GitHub Action

---

## 5. Diller
tr (ana) · en · es · zh — (4.'sü için hi/Hindi alternatif). URL `/tr /en /es /zh` + hreflang + x-default.

## 6. Tasarım Sistemi (onaylı yön — v2 sinematik)
- Koyu obsidyen zemin; **turuncu #FF6A1A + mor #7C3AED + magenta #FF2E97** enerjik neon; cyan/mint vurgu.
- Cam efekti menü, gradyan başlıklar, **3D tilt kartlar**, aurora + parçacık arka plan, animasyonlu sayaçlar.
- **AI Eşleştirme kartı** ana kahraman (para özelliği ön planda).
- Tamamen responsive, `prefers-reduced-motion`, erişilebilir (odak halkaları, kontrast).
- Framer Motion ile giriş animasyonları/scroll reveal — ölçülü, "AI üretimi" hissi vermeden.

---

## 7. Modüller
| # | Modül | İçerik |
|---|---|---|
| A | Oyun Portalı | Vitrin, kategori, En Popüler, Premium, iframe sandbox oynatıcı, skor tablosu |
| B | LFG / Maç Çağrısı | Oda aç/listele/katıl, filtreler, ekip, oda kilidi, AI öneri |
| C | Sohbet | Global lobi + oda içi + birebir DM (realtime, AI moderasyonlu) |
| D | AI Katmanı | Eşleştirme, moderasyon, asistan, içerik/çeviri |
| E | Kullanıcı Paneli | Profil (SEO'lu), bağlı hesaplar, itibar/rozet, arkadaş, cüzdan, geçmiş |
| F | Turnuvalar | Braket, kayıt, Event schema (SEO + gelir) |
| G | Admin | Oyun/kullanıcı/moderasyon/premium/reklam/SEO içerik/analitik |

### Oyun Kayıt Sistemi
Manifest (JSON) + HTML5 paketi → admin'den ekle → iframe sandbox, skor `postMessage` ile. Her yeni oyun **otomatik SEO sayfası + sitemap girişi** üretir.

## 8. Sohbet
Global lobi + oda içi + DM; emoji/reaksiyon, çevrimiçi durumu, yazıyor göstergesi; **AI moderasyonlu**.

## 9. AI Katmanı (Claude API)
1. **AI Akıllı Eşleştirme** — oyun/rütbe/dil/saat/davranış → uyum skorlu öneri (ana gelir+fark)
2. **AI Moderasyon** — toksik/spam/dolandırıcılık filtresi → güvenli topluluk
3. **AI Oyun Asistanı** — öneri, ekip kur, ipucu
4. **AI İçerik & SEO Motoru** — benzersiz açıklama + 4 dil çeviri + rehber taslağı (SEO ölçekler)
> Model seçimi: gerçek-zamanlı (moderasyon/eşleştirme) için hızlı Claude katmanı; içerik/çeviri için güçlü katman.

## 10. Veri Modeli (Firestore)
```
users/{uid}   profil, diller, itibar, rozet, premium, wallet, bağlıHesaplar, davetKodu, seoSlug
games/{id}    manifest, kategori, platform, premium?, oynanma, rating, seoMeta(4 dil)
rooms/{id}    oyun, platform, kapasite, filtreler, durum, sahip, aiUyum   (+/members /chat realtime)
chats/lobby/messages · dms/{pair}/messages       (realtime)
guides/{slug} rehber içerik (4 dil, yayın durumu)
tournaments/{slug}
scores/ · friendships/ · reports/(AI) · transactions/ · referrals/
```

## 11. Büyüme / Viral Döngü
Davet/referral (coin ödülü) · günlük giriş serisi (streak) · skor/takım kartı paylaşımı · Discord bot · web push ("odan dolmak üzere") · sezon/etkinlik.

## 12. Para Kazanma (altyapısı Faz 1'de hazır)
1. **Premium üyelik** — öncelikli AI eşleştirme, reklamsız, premium oyunlar, oda boost, özel rozet
2. **Reklam** — yüksek SEO trafiği → AdSense/gaming ağları
3. **Coin + kozmetik** — çerçeve, tema, rozet
4. **Boost** — oda/profil öne çıkarma
5. **Turnuva** — giriş/komisyon
6. **AI premium özellikler** · 7. **Sponsorlu içerik/turnuva**

## 13. Güvenlik, Moderasyon & Uyum
- Firestore güvenlik kuralları (rol bazlı), rate limit, Turnstile/captcha (spam/bot)
- AI + insan moderasyon, şikayet/engelleme akışı
- **KVKK/GDPR** — gizlilik, çerez onayı, veri silme; yaş kapısı (her yaşa uygun oyunlar için içerik derecelendirme)
- Steam OAuth güvenli akış, XSS/CSRF, iframe sandbox izolasyonu

## 14. Analitik & Deney
GA4 + Vercel Analytics + Search Console; huni (kayıt→takım→dönüş); A/B (CTA, fiyat); SEO panosu.

---

## 15. Fazlar (SEO her faza gömülü)

### Faz 1 — Temel + SEO iskeleti + Ana sayfa
- [ ] Next.js+TS+Tailwind+shadcn+Framer, onaylı sinematik tema
- [ ] i18n (tr/en/es/zh) + middleware locale routing
- [ ] Firebase (Auth+Firestore+Storage), Google+e-posta
- [ ] Kullanıcı profili + veri modeli (wallet/premium/davetKodu)
- [ ] **Ana sayfa** (v2 tasarım: AI kartı, hero, istatistik, En Popüler, Premium bandı) — responsive
- [ ] **SEO temeli:** robots.ts, sitemap.ts, generateMetadata, JSON-LD (Org+WebSite), OG görsel, next/font, next/image, canonical+hreflang helper, GSC+GA4
- [ ] Lighthouse CI + schema validation Action
- [ ] Vercel deploy → forgeandplay.com canlı + Search Console'a sitemap gönder

### Faz 2 — Oyun Portalı + oyun SEO sayfaları
- [ ] Game Registry (manifest + iframe sandbox oynatıcı)
- [ ] Vitrin/kategori/arama/filtre + skor tablosu
- [ ] 2-3 telifsiz örnek oyun
- [ ] **Her oyun için ISR SEO sayfası** (VideoGame schema, benzersiz içerik, OG)

### Faz 3 — LFG + Sohbet (Kalp) + programatik SEO
- [ ] Oda aç/listele/katıl + filtreler + kilit
- [ ] Oda içi sohbet + global lobi + DM (realtime)
- [ ] **LFG hub sayfaları** (oyun × niyet × dil, programatik, FAQ schema)

### Faz 4 — AI Katmanı
- [ ] AI eşleştirme · AI moderasyon · AI asistan · AI içerik/çeviri motoru (SEO ölçekler)

### Faz 5 — Topluluk, Güven & Steam
- [ ] İtibar/rozet + oylama · arkadaş · profil SEO sayfaları
- [ ] Steam OpenID · moderasyon paneli · KVKK akışları

### Faz 6 — Gelir, Turnuva & Büyüme
- [ ] Premium + ödeme (iyzico/Stripe) · coin/kozmetik mağaza · reklam slotları
- [ ] Turnuva (Event schema) · davet/streak · web push
- [ ] Rehber/blog motoru (uzun kuyruk SEO) · gelişmiş admin & SEO panosu

---

## 16. Repo Bağlanınca İlk İş (yarın)
1. Bu dosyayı repoya koy (`/ROADMAP.md`)
2. Faz 1'i uçtan uca: iskelet + tema + onaylı ana sayfa + auth + i18n + **tam SEO temeli**
3. Vercel deploy → canlı + Search Console'a sitemap

## 17. Açık Kararlar
- Slug yerelleştirme: tam yerel mi, ortak mı (SEO'da tam yerel daha güçlü)
- 4. dil: zh vs hi · Ödeme: iyzico vs Stripe · Sesli oda (WebRTC): Faz 4+ opsiyonel
- Çok oyunculu mini oyun: ekstra realtime sunucu (Colyseus) — başta tek oyunculu

## 18. Kısa Rakip Notu
Rakipler (LFG panoları, Discord sunucuları) **manuel + dağınık + SEO'suz**. Bizim farkımız: AI eşleştirme + iki dünya (LFG+oyun) + **SEO-first mimari** ile organik keşfedilebilirlik. Boşluk burada.
