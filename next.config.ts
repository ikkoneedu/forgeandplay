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
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/kohesap-app/:file*.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/kohesap-app/:file*.css", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
