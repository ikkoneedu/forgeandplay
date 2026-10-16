# KO Hesap — Knight Online defteri

Web: `https://forgeandplay.com/tr/kohesap` · Uygulama: `/kohesap-app/index.html` · Windows: `/downloads/KOHesap.exe`

## Yapı

| Klasör | İçerik |
|---|---|
| `public/kohesap-app/` | Arayüzün **tek kaynağı** (web ve exe aynı dosyaları kullanır) |
| `kohesap-desktop/` | Windows exe (Go): yerel sunucu, gizli tarayıcı (canlı pazar), yerel yedek |
| `app/[locale]/kohesap/` | Tanıtım / indirme sayfası (4 dil) |
| `app/api/kohesap/` | `config` (Firebase + exe sürümü), `proxy` (izinli sitelerden 5 dk önbellekli okuma), `rates` |
| `lib/kohesap.ts` | Exe sürümü, izinli alan adları, CORS |

Giriş yalnızca **Google** (Firebase Auth). Kayıtlar Firestore'da:
`kohesap/{uid}` (ortak ayarlar, fiyat listesi, eventler) ve `kohesap/{uid}/chars/{charId}` (karakter başına kayıtlar, en fazla 4).

## Kurulum (bir kez)

1. **Firestore kuralları:** `firestore.rules` dosyasını Firebase Console → Firestore → Rules'a yapıştırıp yayınla (yeni `kohesap` bölümü).
2. **Yetkili alan adları:** Firebase Console → Authentication → Settings → Authorized domains listesinde
   `forgeandplay.com` ve `localhost` olmalı (`localhost` exe'nin Google girişi için gerekli; varsayılan olarak vardır).

## Exe derleme

```bash
cd kohesap-desktop && ./build.sh   # Go 1.24+ ve Node gerekir
```

Çıktı `public/downloads/KOHesap.exe`'ye yazılır. Yeni sürüm çıkarırken `main.go` içindeki `appVersion` ile
`lib/kohesap.ts` içindeki `KOHESAP_EXE_VERSION`'ı birlikte artır; eski exe'ler açılışta "yeni sürüm" uyarısı gösterir.

`public/kohesap-app/firebase.js`, `firebase@11.3.0` paketinden esbuild ile tek dosya olarak üretilmiştir
(auth + firestore; uygulama çevrimdışı da açılabilsin diye CDN yerine gömülü).
