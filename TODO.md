# KO Ekip — Yapılacaklar

## Senin adımların (bir kez)
Hepsi `KURULUM.md`'de adım adım anlatılıyor:
- [ ] Firestore kurallarını yayınla (`firestore.rules` → Firebase Console)
- [ ] Vercel ortam değişkenleri (`.env.example` listesi): Firebase, `FIREBASE_SERVICE_ACCOUNT`, VAPID, `CRON_SECRET`, TURN
- [ ] cron-job.org → dakikada bir `/api/koekip/push/cron?key=CRON_SECRET`
- [ ] Google Search Console'a `https://forgeandplay.com/sitemap.xml` gönder

## Geliştirme sırası
`ROADMAP.md` → "Önerilen sıra":
1. [ ] Ekip etkinlik planlayıcı (RSVP) + alt karakter bağı
2. [ ] Event rehber kartları (uygulama + tanıtım sitesi SEO sayfaları)
3. [ ] Günlük / haftalık yapılacaklar
4. [ ] Katılım geçmişi + drop sırası
5. [ ] Grind oturumu takibi, fiyat alarmı
6. [ ] Ekip arıyorum panosu, paylaşım kartları

## Sonra
- [ ] VIP çevrim içi ödeme (iyzico / Stripe)
