# KO Ekip — Yapılacaklar

## Senin adımların (bir kez)
Hepsi `KURULUM.md`'de adım adım anlatılıyor:
- [ ] Vercel ortam değişkenleri (`.env.example` listesi): Firebase, `FIREBASE_SERVICE_ACCOUNT`, VAPID, `CRON_SECRET`, TURN
- [ ] cron-job.org → dakikada bir `/api/koekip/push/cron?key=CRON_SECRET`
- [ ] Google Search Console'a `https://forgeandplay.com/sitemap.xml` gönder

- Firestore kuralları artık otomatik yayınlanıyor (KURULUM.md → 1).

## Geliştirme sırası
`ROADMAP.md` → "Önerilen sıra":
1. [x] Ekip etkinlik planlayıcı (RSVP) + alt karakter bağı — "Ekip Planı" sayfası. Alt karakterler zaten ekipte tek kişi altında; katılımda karakter seçilir.
2. [x] Event rehber kartları — uygulamada "Event Rehberi", sitede /event-rehberi (`node scripts/build-guides.mjs` ile üretilir)
3. [x] Günlük / haftalık yapılacaklar — "Günlük Görevler" sayfası
4. [x] Katılım geçmişi + drop sırası — Ekip Planı: yoklama, zar / adil sıra, katılım tablosu, Parti & Drop'a aktarma
5. [x] Grind oturumu takibi — "Grind Takibi" sayfası
   - [ ] Fiyat alarmı
6. [ ] Ekip arıyorum panosu, paylaşım kartları

## Sonra
- [ ] VIP çevrim içi ödeme (iyzico / Stripe)
