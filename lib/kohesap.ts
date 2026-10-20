/** KO Hesap (Knight Online defteri) — sunucu tarafı ortak sabitler. */

/** public/downloads/KOHesap.exe sürümü; exe açılışta bunu görüp "yeni sürüm" uyarısı gösterir. */
export const KOHESAP_EXE_VERSION = "0.9.8";
export const KOHESAP_EXE_URL = "/downloads/KOEkip.exe";
export const KOHESAP_APP_URL = "/";

/** Exe yerel arayüzü bu adreslerden çalışır (CORS izni). */
export const KOHESAP_LOCAL_ORIGINS = ["http://localhost:47811", "http://127.0.0.1:47811"];

/** Proxy yalnızca bu alan adlarına istek atar (açık proxy olmasın). */
export const KOHESAP_PROXY_HOSTS = ["enucuzgb.com", "open.er-api.com", "nttgame.com", "bynogame.com", "oyuneks.com", "knightpin.com", "kopazar.com", "bynogame.net", "sonteklif.com"];

export function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  // yerel test: KOHESAP_MARKET_ORIGIN ile verilen sahte kaynak (üretimde tanımsız)
  const dev = process.env.KOHESAP_MARKET_ORIGIN;
  if (dev) { try { if (new URL(dev).hostname === h) return true; } catch {} }
  return KOHESAP_PROXY_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && KOHESAP_LOCAL_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return h;
}
