# Forge&Play

AI destekli **oyun arkadaşı platformu** (LFG / maç çağrısı) + **anında oynanan oyun portalı**.
Steam / Epic / Xbox / PS5 / PC oyuncuları için takım bulma, canlı sohbet ve her yaşa uygun mini oyunlar.

- **Site:** https://forgeandplay.com
- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Firebase · Vercel · Claude AI
- **Diller:** Türkçe · English · Español · 中文 (next-intl, `/tr /en /es /zh`)

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:3000  → /tr adresine yönlenir
npm run build    # üretim derlemesi
```

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun (Vercel'de
**Settings → Environment Variables**):

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_FIREBASE_*` — Firebase istemci yapılandırması
- `ANTHROPIC_API_KEY` — Claude AI (sunucu tarafı)

## Yapı

```
app/[locale]/       lokalize sayfalar (ana sayfa)
app/robots.ts       robots.txt
app/sitemap.ts      çok dilli sitemap (hreflang)
app/manifest.ts     PWA manifest
components/home/     ana sayfa (sinematik + 3D AI eşleştirme kartı)
i18n/                next-intl yapılandırması
messages/            tr / en / es / zh çevirileri
lib/                 site sabitleri, firebase, seo (JSON-LD)
```

## Yol Haritası

Detaylı plan için `ROADMAP.md` dosyasına bakın (Faz 1–6: temel → oyun portalı →
LFG + sohbet → AI katmanı → topluluk → gelir).

## Faz 1 (bu sürüm)

- [x] Next.js + TS + Tailwind sinematik tema
- [x] i18n (tr/en/es/zh) + lokalize yönlendirme
- [x] Ana sayfa (hero, canlı istatistik, AI eşleştirme kartı, oyun vitrini, premium)
- [x] SEO temeli: metadata, canonical + hreflang, sitemap, robots, JSON-LD, OG
- [x] Firebase istemci yapılandırma iskeleti
