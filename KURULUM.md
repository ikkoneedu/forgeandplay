# KO Ekip kurulumu

forgeandplay.com açılınca doğrudan **KO Ekip** gelir. Eski site sayfaları ana sayfaya yönlenir. Yalnızca gizlilik, kullanım şartları ve iletişim sayfaları kalır.

Aşağıdaki adımlar bir kez yapılır. 1 ve 2 olmadan uygulama yine çalışır, ama boss sayaçları, bildirimler ve telefonda ses eksik kalır.

## 1. Firebase kuralları (zorunlu)

Bu sürümde iki yeni alan var: boss sayaçları ve bildirim ayarları.

1. Firebase Console'da **Firestore Database → Rules** sekmesini aç.
2. Oradaki metnin tamamını sil.
3. Repodaki `firestore.rules` dosyasının tamamını yapıştır.
4. **Publish**'e bas.

## 2. Vercel ortam değişkenleri

Proje Vercel'de **ikkoneedu (Pro)** ekibinde, adı `forgeandplay`. GitHub'daki `main` her push'ta otomatik yayınlanır; diğer branch'ler önizleme alır.
Domain: `forgeandplay.com` esas adres, `www.forgeandplay.com` ona 308 ile yönlenir.

Değişkenleri **Vercel → Proje → Settings → Environment Variables** sayfasına ekle (Production). Ekledikten sonra **Redeploy** yap. Tam liste: `.env.example`.

| Değişken | Ne işe yarar | Nereden |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Telefona bildirim | Hazır verildi (ayrı dosyada) |
| `VAPID_PRIVATE_KEY` | Telefona bildirim | Hazır verildi (ayrı dosyada) |
| `CRON_SECRET` | Zamanlayıcı anahtarı | Hazır verildi (ayrı dosyada) |
| `FIREBASE_SERVICE_ACCOUNT` | Sunucunun bildirim göndermesi | Aşağıdaki 2a adımı |
| `CF_TURN_KEY_ID` | Sesli sohbet aktarma sunucusu | Aşağıdaki 2b adımı |
| `CF_TURN_API_TOKEN` | Sesli sohbet aktarma sunucusu | Aşağıdaki 2b adımı |

### 2a. Firebase hizmet hesabı

1. Firebase Console'da **⚙ Proje ayarları → Hizmet hesapları** sayfasına git.
2. **Yeni özel anahtar oluştur**'a bas. Bir `.json` dosyası iner.
3. Dosyayı Not Defteri ile aç.
4. İçeriğin **tamamını** kopyalayıp `FIREBASE_SERVICE_ACCOUNT` değerine yapıştır.

> Bu dosya gizlidir. GitHub'a yükleme, kimseyle paylaşma.

### 2b. Cloudflare TURN (telefon ↔ telefon / telefon ↔ PC ses)

Mobil operatörler (Turkcell, Vodafone, Türk Telekom) ve bazı modemler, cihazlar arasında doğrudan bağlantıya izin vermez. Telefonlarda ses bu yüzden bağlanmıyordu. Aktarma sunucusu bu sorunu çözer. Cloudflare'de ayda **1000 GB** ücretsiz; 8 kişilik ekip için fazlasıyla yeter.

1. https://dash.cloudflare.com adresinde ücretsiz hesap aç.
2. Sol menüden **Realtime**'ı aç. Eski adı **Calls**'tur.
3. **TURN Server** bölümünde **Create**'e bas ve bir ad ver (örnek: `koekip`).
4. Ekranda iki değer çıkar:
   - **Turn Token ID** → `CF_TURN_KEY_ID`
   - **API Token** → `CF_TURN_API_TOKEN`

   API Token yalnızca bir kez gösterilir, hemen kaydet.

> Başka bir TURN sağlayıcısı (örn. metered.ca) da kullanılabilir. O zaman bu üç değişkeni gir:
> - `TURN_URLS` (virgülle ayrılmış)
> - `TURN_USERNAME`
> - `TURN_CREDENTIAL`

## 3. Zamanlayıcı (event / boss bildirimleri için)

Vercel'in ücretsiz planı dakikada bir çalışan görev desteklemez. Bunun yerine ücretsiz **cron-job.org** kullanılır.

1. https://cron-job.org adresinde ücretsiz hesap aç.
2. **Create cronjob**'a bas.
3. Ayarları şöyle yap:
   - URL: `https://forgeandplay.com/api/koekip/push/cron?key=CRON_SECRET` (sondaki `CRON_SECRET` yerine kendi değerini yaz)
   - Execution schedule: **Every 1 minute**
4. Kaydet.

Kontrol etmek için KO Ekip'te admin olarak **Bildirimler** sayfasının altındaki **Sunucu durumu** kartına bak. Dört satırın hepsi ✅ olmalı.

## 4. Telefona kurulum (her üye)

**Android (Chrome):**
1. forgeandplay.com'u aç.
2. Menüden (⋮) **Ana ekrana ekle / Uygulamayı yükle**'yi seç.
3. KO Ekip'i ana ekrandan aç.
4. **Bildirimler** sayfasında **Bildirimleri aç**'a bas.

**iPhone (Safari, iOS 16.4+):**
1. forgeandplay.com'u aç.
2. **Paylaş → Ana Ekrana Ekle**'yi seç.
3. Ana ekrandaki **KO Ekip** simgesinden aç.
4. **Bildirimler** sayfasında **Bildirimleri aç**'a bas.

iPhone'da bildirim yalnızca ana ekrandan açılan uygulamada çalışır.

## Bildirimler

- **Event öncesi:** Event Takvimi'nde açık olan eventler, seçilen süre kadar önce (varsayılan 10 dk).
- **Boss alarmı:** Boss Alarmı sayfasında zili açık olan boss'lar için, çıkmadan 10 dk önce. Ekipten biri **☠ Öldü** işaretlediğinde sayaç kurulur. Sayaçlar ekip ve sunucu başına paylaşılır.
- **📣 Çıktı:** Bir boss çıkınca ekibe anında bildirim gider ve sohbete bot mesajı düşer.
- **Ekip online:** Ekipten biri KO Ekip'i açınca diğerlerine bildirim gider. Aynı kişi için en fazla yarım saatte bir.

## Windows uygulaması

`public/downloads/KOEkip.exe` dosyası (sürümü `lib/kohesap.ts` → `KOHESAP_EXE_VERSION`) eski `KOHesap.exe`'nin yerini aldı. Eski exe "yeni sürüm" uyarısıyla bunu indirir. Kayıtlar aynı klasörde (`KOHesap-veri`) kalır.
