# KO Hesap — Knight Online defteri

Web: `https://koekip.app/app` · Uygulama dosyaları: `public/kohesap-app/` · Windows: `/downloads/KOEkip.exe`

## Yapı

| Klasör | İçerik |
|---|---|
| `public/kohesap-app/` | Arayüzün **tek kaynağı** (web ve exe aynı dosyaları kullanır) |
| `kohesap-desktop/` | Windows exe (Go): yerel sunucu, gizli tarayıcı (canlı pazar), yerel yedek |
| `public/site/` | Tanıtım / indirme sitesi (koekip.app) |
| `app/api/kohesap/` | `config` (Firebase + exe sürümü), `proxy` (izinli sitelerden 5 dk önbellekli okuma), `rates` |
| `lib/kohesap.ts` | Exe sürümü, izinli alan adları, CORS |

Giriş yalnızca **Google** (Firebase Auth). Kayıtlar Firestore'da:
`kohesap/{uid}` (ortak ayarlar, fiyat listesi, eventler) ve `kohesap/{uid}/chars/{charId}` (karakter başına kayıtlar, en fazla 4).

## Kurulum (bir kez)

1. **Firestore kuralları:** `firestore.rules` dosyasını Firebase Console → Firestore → Rules'a yapıştırıp yayınla (yeni `kohesap` bölümü).
2. **Yetkili alan adları:** Firebase Console → Authentication → Settings → Authorized domains listesinde
   `koekip.app` ve `localhost` olmalı (`localhost` exe'nin Google girişi için gerekli; varsayılan olarak vardır).

## Exe derleme

```bash
cd kohesap-desktop && ./build.sh   # Go 1.24+ ve Node gerekir
```

Çıktı `public/downloads/KOEkip.exe`'ye yazılır. Yeni sürüm çıkarırken `main.go` içindeki `appVersion` ile
`lib/kohesap.ts` içindeki `KOHESAP_EXE_VERSION`'ı birlikte artır; eski exe'ler açılışta "yeni sürüm" uyarısı gösterir.

`public/kohesap-app/firebase.js`, `firebase@11.3.0` paketinden esbuild ile tek dosya olarak üretilmiştir
(auth + firestore; uygulama çevrimdışı da açılabilsin diye CDN yerine gömülü).

## Admin paneli

`public/kohesap-app/cloud.js` içindeki `ADMIN_EMAILS` listesindeki Google hesabı (şu an `carkci.caner@gmail.com`) uygulamada **Yönetim** sayfasını görür:

- **Veri kaynakları:** GB / canlı pazar / event sayfa adresleri ve yenileme süreleri → "Herkese kaydet" ile `config/kohesap` belgesine yazılır, tüm kullanıcılar kullanır. Diğer kullanıcılar adresleri, teşhisi ve "yeniden keşfet"i görmez.
- **İçerik yayını:** Event Takvimi ve PUS Hesabı sayfalarındaki "Herkese yayınla" → `config/kohesapContent`. Kullanıcılar bir sonraki girişte alır; kendi eklediği event / özel PUS itemleri korunur.
- **Durum:** Paylaşılan canlı pazar (exe'nin son paylaşımı), yayınlanan içerik ve merkezi ayar durumu.

Firestore kuralı: `config/*` herkese okunur, yalnızca `isAdmin()` yazar (mevcut kural).
