# Forge&Play — Yapılacaklar (Senin Adımların)

Platformun tamamı kodlandı ve canlıda (demo modda çalışıyor). Aşağıdakiler
**senin yapman gerekenler** — her biri bir özelliği "demo"dan "gerçek"e çevirir.
Öncelik sırasına göre dizildi.

---

## ✅ Kodda hazır olan (bende biten)
- Ana sayfa (sinematik, 3D AI kartı) · 4 dil (tr/en/es/zh)
- Oyun portalı + 3 oynanabilir oyun + her oyun için SEO sayfası
- LFG (takım bul): 8 oyun hub'ı, oda aç/katıl, sohbet (demo)
- AI Asistan (yüzen widget), Premium, Turnuvalar, Profil, Giriş sayfaları
- Tam SEO temeli: sitemap, robots, hreflang, JSON-LD (VideoGame/FAQ/Event/Breadcrumb)
- ~70 indekslenebilir sayfa (4 dilde)

---

## 1. 🌐 Domaini bağla (5 dk) — EN ÖNCELİKLİ
Site şu an `...vercel.app` adresinde. forgeandplay.com'a bağla:
1. Eski **forge-and-play** projesi → Settings → Domains → `forgeandplay.com` **Remove**
2. Yeni **forgeandplay** projesi → Settings → Domains → **Add** `forgeandplay.com`
(Aynı Vercel hesabı olduğu için anında geçer.)

## 2. 🔍 SEO'yu başlat (senin 1 numaralı hedefin)
1. **Google Search Console** → forgeandplay.com'u ekle & doğrula
2. Sitemap gönder: `https://forgeandplay.com/sitemap.xml`
3. **Bing Webmaster Tools** → aynısı
4. **Google Analytics 4** hesabı aç → ölçüm kimliğini (G-XXXX) al
   → Vercel env: `NEXT_PUBLIC_GA_ID`

## 3. 🔥 Firebase kur (giriş + LFG + sohbet gerçek olsun)
1. https://console.firebase.google.com → **Add project** → `forgeandplay`
2. **Authentication** → Sign-in method → **Google** + **Email/Password** aç
3. **Firestore Database** → Create (production mode)
4. Project Settings → **Web app** ekle (</>) → config değerlerini kopyala
5. Vercel env'e ekle (Settings → Environment Variables):
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
6. Bana "Firebase hazır" de → giriş, profil, gerçek zamanlı LFG & sohbeti bağlayayım

## 4. 🤖 Anthropic (Claude) API — AI gerçek çalışsın
1. https://console.anthropic.com → API key oluştur
2. Vercel env: `ANTHROPIC_API_KEY`
3. (opsiyonel model: `ANTHROPIC_MODEL`, varsayılan claude-sonnet-5)
→ AI Asistan ve (sonraki) AI eşleştirme gerçek yanıt verir

## 5. 💳 Ödeme (Premium geliri) — sonraki aşama
- **iyzico** (Türkiye) veya **Stripe** (global) hesabı aç
- Bana anahtarları ver → Premium satın alma akışını bağlayayım
- Not: Vercel Hobby ticari kullanım için değil → gelir başlayınca **Vercel Pro**

## 6. 🎨 İçerik & büyüme (zamanla)
- Gerçek oyun kapak görselleri (şu an gradyan)
- Daha fazla mini oyun (registry hazır — kolay eklenir)
- Blog/rehber içerikleri (uzun kuyruk SEO)
- Sosyal medya + Discord topluluğu (backlink + trafik)

---

## Öncelik özeti
1. **Domaini bağla** (5 dk)
2. **Search Console + Analytics** (SEO başlasın)
3. **Firebase** (giriş + LFG gerçek olsun)
4. **Anthropic key** (AI gerçek olsun)
5. Ödeme + içerik (sonra)

Her adımda takılırsan bana yaz — ekran ekran anlatırım. Anahtarları verdiğinde
ilgili özelliği tek tek "gerçek"e çeviririm.
