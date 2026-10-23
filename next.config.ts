import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firestore kuralları sunucudan otomatik yayınlanır (lib/rules-sync.ts); dosya bu rotalarla birlikte taşınır
  outputFileTracingIncludes: {
    "/api/koekip/push/[action]": ["./firestore.rules"],
    "/api/kohesap/rules": ["./firestore.rules"],
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
    // Güvenlik başlıkları: tıklama kaçırma (iframe), MIME tahmini, yönlendiren bilgisi, izinler, HTTPS zorunlu.
    // Dizinleme (X-Robots-Tag) middleware.ts'de: tanıtım sitesi açık, uygulama / API kapalı.
    const security = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/kohesap-app/:file*.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/kohesap-app/:file*.css", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/site/:file*.css", headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=3600" }] },
      { source: "/site/img/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }] },
    ];
  },
};

export default nextConfig;
