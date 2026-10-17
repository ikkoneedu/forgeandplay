import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // bildirim servis çalışanı tüm siteyi kapsasın diye kökten sunulur
        { source: "/sw.js", destination: "/kohesap-app/sw.js" },
        { source: "/manifest.webmanifest", destination: "/kohesap-app/manifest.webmanifest" },
        { source: "/apple-touch-icon.png", destination: "/kohesap-app/icons/apple-touch-icon.png" },
        { source: "/favicon.ico", destination: "/kohesap-app/icons/favicon.ico" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/downloads/KOHesap.exe", destination: "/downloads/KOEkip.exe", permanent: false },
    ];
  },
  async headers() {
    // Güvenlik başlıkları: tıklama kaçırma (iframe), MIME tahmini, yönlendiren bilgisi, izinler, HTTPS zorunlu,
    // arama motoru / yapay zekâ dizinleme yasağı
    const security = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/kohesap-app/:file*.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/kohesap-app/:file*.css", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
