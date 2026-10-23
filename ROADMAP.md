# KO Ekip — Yol Haritası (v4)

> Önceki yol haritası (Forge&Play LFG + mini oyun portalı) bırakıldı. Ürün artık **KO Ekip**:
> Knight Online ekipleri için tek uygulama. Bu belge, diğer MMORPG yardımcı araçlarından
> (BDO/Garmoth, WoW raid araçları, Lost Ark yardımcıları) ve KO'nun kendi sistemlerinden çıkarılan
> fikirleri, KO Ekip'te olmayan ve onu **eşsiz** yapacak özellikler olarak sıralar.

## Bugün olanlar (0.9.8)
Ekip (8 kişi, davet) · Ekip yazışması + bot · Sesli oda (bas-konuş, TURN) · Boss alarmı · Event takvimi ·
Yeni sunucu haberleri · Web Push bildirimleri · Defter (panel, gelir/gider, item ticareti, parti & drop) ·
Canlı GB / pazar / site ilanları · PUS, EXP, item basma (örs simülasyonu), fiyat listesi · VIP planı ·
Windows exe · KVKK: veri indir / hesabı sil.

## İlke
- **Oyuna dokunmayız.** Okuma, otomasyon, bellek/paket yok. Her şey kullanıcının girdiği veri + herkese açık kaynaklar.
  Bu, KO Ekip'in "güvenli, ban riski yok" vaadinin temeli; her yeni özellik buna uymalı.
- Önce **ekip** (ağ etkisi: bir kişi getirir, sekiz kişi kalır), sonra bireysel araçlar.

---

## Faz A — Ekip katmanını derinleştir (en yüksek değer)

| # | Özellik | Neden / nereden | Not |
|---|---|---|---|
| A1 | ✅ **Ekip etkinlik planlayıcı (RSVP)** | WoW raid planlayıcıları (GuildForge): "Cumartesi 21:00 CSW — Geliyorum / Belki / Gelmiyorum" | Event takvimiyle bağlanır; katılım geçmişi tutulur, bildirim gider |
| A2 | ✅ **Katılım & puan geçmişi** | WoW DKP/EPGP: drop paylaşımında adalet | Parti & Drop'a bağlanır: kim kaç etkinliğe geldi, kim ne aldı |
| A3 | ✅ **Drop sırası / zar** | Loot council, zar sistemi | Ekip içi "bu item'e kim zar atar" + sonucu deftere yazma |
| A4 | **Kompozisyon önerisi** | Raid kompozisyon araçları | Ekipteki sınıflara göre eksik rol uyarısı (ör. "priest yok") |
| A5 | ✅ **Alt karakter bağı** | Raid araçlarında main/alt eşleme | Bir oyuncunun 4 karakteri tek kişi sayılır (katılım/pay için) |
| A6 | ✅ **Ekip panosu / duyuru + sabitlenen not** | Discord'un dağınıklığına alternatif | Ekip kuralları, parti stratejisi, toplanma yeri |

## Faz B — KO'ya özgü sistemler (rakipte olmayan derinlik)

| # | Özellik | Ayrıntı |
|---|---|---|
| B1 | ✅ **Event rehber kartları** | BDW, Chaos, Juraid, FT, Bifrost, CSW, Lunar/Dark Lunar: seviye aralığı, ödül, süre, ekip taktiği; takvimdeki her etkinliğe bağlanır |
| B2 | ✅ **Boss tahmin penceresi** | Kesin saat yerine "en erken – en geç" pencere (KO'da respawn sapabiliyor); ekip içi "gördüm/öldü" bildirimleri pencereyi daraltır |
| B3 | ✅ **Günlük / haftalık yapılacaklar** | Lost Ark yardımcılarındaki karakter başı checklist: günlük görevler, event katılımı, sıfırlanma saatinde otomatik temizlenir |
| B4 | ✅ **Grind oturumu takibi** | Garmoth Grind Tracker: başlat/bitir, kazanılan EXP/para/drop, saat başı verim; EXP hesabına ve deftere bağlanır |
| B5 | ✅ **Item basma günlüğü istatistikleri** (topluluk oranı) | Simülatörün yanında gerçek basma sonuçları; topluluk geneli anonim oran (kişisel "şans" karşılaştırması) |
| B6 | ✅ **Set / build planlayıcı** (Hedef Listesi) | Garmoth Gear Planner: karakter için hedef item listesi, toplam maliyet (canlı pazar fiyatıyla), eksikler |
| B7 | ✅ **Fiyat geçmişi ve alarm** (GB) | Canlı GB/pazar verisini saklayıp grafik + "X item Y'nin altına düşünce haber ver" (VIP) |

## Faz C — Topluluk ve büyüme

| # | Özellik | Ayrıntı |
|---|---|---|
| C1 | ✅ **Ekip arıyorum / üye arıyorum panosu** | Sunucu + sınıf + seviye + saat; KO Ekip'in giriş kapısı (ilk vizyondaki LFG'nin KO'ya uyarlanmışı) |
| C2 | ✅ **Paylaşılabilir kartlar** | "Ekibimiz CSW'yi aldı", "+10 bastım" görselleri (next/og) → WhatsApp/Discord önizlemesi = organik büyüme |
| C3 | ✅ **Discord köprüsü** | Ekip bildirimleri bir Discord kanalına da düşsün (webhook) |
| C4 | ✅ **Tanıtım sitesine SEO rehberleri** (/event-rehberi) | Event rehberleri (B1) herkese açık sayfa olarak: "Juraid Mountain nedir", "Chaos saatleri" |

## Faz D — Teknik sağlık
- Uygulama JS'inde (yaklaşık 8.400 satır, monkey-patch zinciri `const _renderX = render`) modül sınırları netleştirilmeli.
- Basit uçtan uca test (Playwright): giriş ekranı, hesaplayıcılar, bot kapısı.
- Lighthouse / Core Web Vitals kontrolü tanıtım sitesinde.

---

## Önerilen sıra
1. **A1 Etkinlik planlayıcı + A5 alt bağı** (ekip katmanının omurgası)
2. **B1 Event rehber kartları** (hem uygulama hem SEO — C4 ile birlikte)
3. **B3 Günlük yapılacaklar** (her gün uygulamaya dönme sebebi)
4. **A2/A3 Katılım & drop sırası** (Parti & Drop'u eşsiz yapar)
5. **B4 Grind takibi**, **B7 fiyat alarmı** (VIP değeri)
6. **C1 Ekip arıyorum panosu**, **C2 paylaşım kartları** (büyüme)

## Kaynaklar (araştırma)
- WoW raid / loot araçları: [GuildForge](https://www.curseforge.com/wow/addons/guildforge), [Guildhall Companion](https://www.curseforge.com/wow/addons/guildhall-companion), [Guildlogistics](https://www.curseforge.com/wow/addons/guildlogistics), [WCRT](https://www.curseforge.com/wow/addons/wow-classic-raid-tools-wcrt)
- BDO: [Garmoth](https://garmoth.com/enhancing-simulator) (boss timer, grind tracker, enhancing simulator, gear planner)
- Lost Ark yardımcıları: [MeinMMO — Lost Ark araçları](https://mein-mmo.de/lost-ark-tools-daily/)
- KO event listesi ve boss respawn notları: [Steam topluluk — event takvimi](https://steamcommunity.com/app/389430/discussions/3/1736593325991063913), [Steam — boss respawn](https://steamcommunity.com/app/389430/discussions/0/4628107854300123942)
