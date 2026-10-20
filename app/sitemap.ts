import type { MetadataRoute } from "next";

/** Herkese açık tanıtım sitesi sayfaları (public/site). Uygulama (/app) dizinlenmez. */
const SITE_URL = "https://forgeandplay.com";
const UPDATED = new Date("2026-10-20");
export default function sitemap(): MetadataRoute.Sitemap {
  const p = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly", images: string[] = []) =>
    ({ url: SITE_URL + path, lastModified: UPDATED, changeFrequency, priority, ...(images.length ? { images: images.map((i) => SITE_URL + i) } : {}) });
  return [
    p("/", 1, "weekly", ["/site/og.jpg", "/site/img/app-boss.webp", "/site/img/app-event.webp", "/site/img/app-exp.webp", "/site/img/app-basma.webp"]),
    p("/yeni-sunucu", 0.9, "weekly"),
    p("/exp-tablosu", 0.8, "monthly"),
    p("/item-basma-oranlari", 0.8, "monthly", ["/site/img/app-basma.webp"]),
    p("/iletisim", 0.3, "yearly"),
    p("/kullanim-sartlari", 0.2, "yearly"),
    p("/gizlilik", 0.2, "yearly"),
  ];
}
