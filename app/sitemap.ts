import type { MetadataRoute } from "next";
import { LOCALES, SITE_URL } from "@/lib/site";
import { getAllGames } from "@/lib/games";
import { getAllLfgGames } from "@/lib/lfg";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  const withAlternates = (path: string) => ({
    languages: Object.fromEntries(
      LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])
    ),
  });

  // Home + games listing per locale
  for (const locale of LOCALES) {
    entries.push({
      url: `${SITE_URL}/${locale}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
      alternates: withAlternates(""),
    });
    entries.push({
      url: `${SITE_URL}/${locale}/oyunlar`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: withAlternates("/oyunlar"),
    });
    entries.push({
      url: `${SITE_URL}/${locale}/topluluk`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
      alternates: withAlternates("/topluluk"),
    });
    entries.push({
      url: `${SITE_URL}/${locale}/lfg`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: withAlternates("/lfg"),
    });
    entries.push({
      url: `${SITE_URL}/${locale}/premium`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: withAlternates("/premium"),
    });
    entries.push({
      url: `${SITE_URL}/${locale}/turnuvalar`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.75,
      alternates: withAlternates("/turnuvalar"),
    });
    for (const p of ["/gizlilik", "/kullanim-sartlari", "/iletisim"]) {
      entries.push({
        url: `${SITE_URL}/${locale}${p}`,
        lastModified: now,
        changeFrequency: "yearly",
        priority: 0.3,
        alternates: withAlternates(p),
      });
    }
  }

  // LFG per-game hubs (programmatic SEO)
  for (const game of getAllLfgGames()) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}/lfg/${game.slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.85,
        alternates: withAlternates(`/lfg/${game.slug}`),
      });
    }
  }

  // Individual game pages per locale
  for (const game of getAllGames()) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}/oyna/${game.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: withAlternates(`/oyna/${game.slug}`),
      });
    }
  }

  return entries;
}
