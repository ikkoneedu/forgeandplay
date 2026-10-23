# KO Ekip · forgeandplay.com

**Knight Online oyuncuları için ekip uygulaması.** Ekip kurma, sesli oda, boss alarmı, event takvimi,
telefon bildirimleri, gelir–gider defteri, EXP / PUS / item basma hesapları ve canlı fiyatlar tek yerde.
Tarayıcıda, telefonda (PWA) ve Windows'ta (KOEkip.exe) aynı hesapla çalışır.

- **Site:** https://forgeandplay.com (tanıtım) · https://forgeandplay.com/app (uygulama)
- **Stack:** Next.js 15 (yalnızca API + yönlendirme) · düz JS PWA · Firebase (Auth + Firestore) · Web Push · Cloudflare TURN · Go (Windows exe) · Vercel
- **Kurulum:** `KURULUM.md` · **Yol haritası:** `ROADMAP.md` · **Yapılacaklar:** `TODO.md`

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:3000 → tanıtım sitesi, /app → uygulama
npm run build
```

Ortam değişkenleri için `.env.example` → `.env.local`.

## Yapı

```
middleware.ts            yönlendirme + bot kapısı: "/" ve tanıtım sayfaları → public/site, "/app" → public/kohesap-app
public/site/             herkese açık tanıtım sitesi (statik HTML, SEO, JSON-LD)
public/kohesap-app/      uygulamanın TEK kaynağı (web, PWA ve exe aynı dosyaları kullanır)
public/downloads/        KOEkip.exe
app/api/kohesap/*        config, account (hesap silme), plan (VIP), turn (ses), news, market, ilan, kc, item, img, proxy, rates
app/api/koekip/push/*    Web Push abonelik + cron (event / boss / ekip bildirimleri)
app/robots.ts, sitemap.ts
lib/                     sunucu yardımcıları (koekip-server, kohesap, ko-news, ilan, kc-price, …)
kohesap-desktop/         Windows exe (Go): yerel sunucu, bas-konuş, canlı pazar tarayıcısı
firestore.rules          Firestore güvenlik kuralları (Firebase Console'a yapıştırılır)
```

## Sürüm çıkarma (exe)

1. `kohesap-desktop/main.go` → `appVersion` ve `lib/kohesap.ts` → `KOHESAP_EXE_VERSION` aynı değere çekilir.
2. `cd kohesap-desktop && ./build.sh` → `public/downloads/KOEkip.exe`.
3. Uygulama dosyası değiştiyse `public/site/*.html` ve `index.html` içindeki `?v=` sürümleri artırılır.
