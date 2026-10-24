# KO Ekip — Yapılacaklar

## Senin adımların (bir kez)
Hepsi `KURULUM.md`'de adım adım anlatılıyor:
- [ ] Vercel ortam değişkenleri (`.env.example` listesi): Firebase, `FIREBASE_SERVICE_ACCOUNT`, VAPID, `CRON_SECRET`, TURN
- [ ] cron-job.org → dakikada bir `/api/koekip/push/cron?key=CRON_SECRET`
- [ ] Google Search Console'a `https://koekip.app/sitemap.xml` gönder

- Firestore kuralları artık otomatik yayınlanıyor (KURULUM.md → 1).

## Geliştirme sırası
`ROADMAP.md` → "Önerilen sıra":
1. [x] Ekip etkinlik planlayıcı (RSVP) + alt karakter bağı — "Ekip Planı" sayfası. Alt karakterler zaten ekipte tek kişi altında; katılımda karakter seçilir.
2. [x] Event rehber kartları — uygulamada "Event Rehberi", sitede /event-rehberi (`node scripts/build-guides.mjs` ile üretilir)
3. [x] Günlük / haftalık yapılacaklar — "Günlük Görevler" sayfası
4. [x] Katılım geçmişi + drop sırası — Ekip Planı: yoklama, zar / adil sıra, katılım tablosu, Parti & Drop'a aktarma
5. [x] Grind oturumu takibi — "Grind Takibi" sayfası
   - [x] Fiyat alarmı (GB: geçmiş grafiği + eşik alarmı)
6. [x] Ekip arıyorum panosu — "Ekip Bul" sayfası
   - [x] Paylaşım kartları (plan daveti, ekip kartı, grind sonucu)

## Ek
- [x] Boss çıkış penceresi (ekip verisinden öğrenilir)
- [x] Ekip duyurusu (sabit not) ve Discord köprüsü
- [x] Item basma: topluluk oranları (anonim, isteğe bağlı)
- [x] Hedef listesi (set / build planlayıcı, ROADMAP B6)
- [x] Kompozisyon önerisi: eksik rol için alt karakter önerisi, event seviye şartı uyarısı (ROADMAP A4)
- [x] Hızlı arama (Ctrl+K ya da "/"): sayfa, işlem, rehber, karakter, fiyat
- [x] Panel "Bugün" şeridinde hedef listesi kartı
- [x] Panelde "Başlarken" listesi (GB fiyatı, ekip, bildirim, ana ekran, ilk görev, ilk kayıt)
- [x] Testler + CI (`npm test`, `npm run test:rules`, `.github/workflows/ci.yml`)

## Sonra
- [ ] VIP çevrim içi ödeme (iyzico / Stripe)
