import type { MetadataRoute } from "next";

/**
 * Tanıtım sitesi herkese açık (arama motorları ve yapay zekâ ARAMA botları dizinler);
 * uygulama (/app), API ve uygulama dosyaları kapalı. Yapay zekâ EĞİTİM tarayıcıları hiçbir yere giremez.
 */
const SITE_URL = "https://koekip.app";
export default function robots(): MetadataRoute.Robots {
  const train = ["GPTBot", "CCBot", "Google-Extended", "GoogleOther", "Bytespider", "anthropic-ai", "ClaudeBot",
    "cohere-ai", "cohere-training-data-crawler", "Diffbot", "meta-externalagent", "FacebookBot", "Amazonbot",
    "Applebot-Extended", "Omgilibot", "Timpibot", "ImagesiftBot", "AI2Bot", "PetalBot", "SemrushBot", "AhrefsBot",
    "MJ12bot", "DotBot", "DataForSeoBot", "BLEXBot", "MistralAI-User"];
  const closed = ["/app", "/api/", "/kohesap-app/", "/downloads/", "/site/*.html", "/*?p="];
  return {
    rules: [
      ...train.map((userAgent) => ({ userAgent, disallow: "/" })),
      { userAgent: "*", allow: ["/", "/api/kohesap/plan", "/kohesap-app/icons/", "/kohesap-app/fonts/"], disallow: closed },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
