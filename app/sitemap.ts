import type { MetadataRoute } from "next";
import { LOCALES, SITE_URL } from "@/lib/site";
import { getAllGames } from "@/lib/games";

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
