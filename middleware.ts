import { NextRequest, NextResponse } from "next/server";

/**
 * forgeandplay.com → KO Ekip
 *  1) Herkese açık tanıtım sitesi (/, /exp-tablosu, /item-basma-oranlari, yasal sayfalar):
 *     arama motorları ve yapay zekâ ARAMA botları dizinler; yapay zekâ EĞİTİM tarayıcıları ve SEO kazıyıcıları engellenir.
 *  2) Uygulama (/app), API ve uygulama dosyaları: eskisi gibi tüm botlar engellenir (403), dizinlenmez.
 *  3) Eski site sayfaları "/"e yönlenir.
 * Asıl koruma: veriler yalnızca Google ile giriş yapıp üyeliği olanlara açıktır
 * (Firestore kuralları + API kimlik kontrolü). Bu katman botları kapıda çevirir.
 */
// tanıtım sitesi sayfaları → public/site/*.html
const SITE: Record<string, string> = {
  "/": "index", "/exp-tablosu": "exp-tablosu", "/item-basma-oranlari": "item-basma-oranlari", "/yeni-sunucu": "yeni-sunucu",
  "/kullanim-sartlari": "kullanim-sartlari", "/gizlilik": "gizlilik", "/iletisim": "iletisim",
};
// herkese açık dosyalar (tanıtım sitesinin kullandıkları)
const PUBLIC_FILE = /^\/(site\/|robots\.txt$|sitemap\.xml$|favicon\.ico$|apple-touch-icon\.png$|manifest\.webmanifest$|llms\.txt$|kohesap-app\/fonts\/|kohesap-app\/icons\/|downloads\/|api\/kohesap\/plan$)/;
// açık sayfalarda bile istemediklerimiz: yapay zekâ eğitim tarayıcıları, veri kazıyıcılar, SEO botları
const TRAIN = /GPTBot|CCBot|Google-Extended|GoogleOther|Google-CloudVertexBot|Bytespider|Bytedance|anthropic-ai|ClaudeBot|cohere|Diffbot|meta-externalagent|meta-webindexer|FacebookBot|Amazonbot|Applebot-Extended|omgili|Timpibot|ImagesiftBot|AI2Bot|Ai2Bot|PetalBot|Kangaroo Bot|Scrapy|Firecrawl|Jina-|Browserbase|SemrushBot|AhrefsBot|MJ12bot|DotBot|DataForSeoBot|Barkrowler|BLEXBot|serpstat|zoominfo|MistralAI|YouBot|shapbot|v0bot/i;
const OLD_LEGAL = /^\/(?:tr|en|es|zh)\/(gizlilik|kullanim-sartlari|iletisim)\/?$/;
const NOINDEX = "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai";

// Yapay zekâ botları / asistanları, kazıyıcılar, otomasyon ve komut satırı araçları
const BLOCK = new RegExp([
  "GPTBot", "ChatGPT", "OAI-SearchBot", "OpenAI", "ClaudeBot", "Claude-", "anthropic", "PerplexityBot", "Perplexity",
  "Google-Extended", "GoogleOther", "Gemini", "Google-CloudVertexBot", "CCBot", "Bytespider", "Bytedance", "Amazonbot",
  "Applebot", "meta-externalagent", "meta-externalfetcher", "meta-webindexer", "FacebookBot", "cohere", "Diffbot",
  "YouBot", "MistralAI", "DuckAssistBot", "AI2Bot", "Ai2Bot", "Timpibot", "ImagesiftBot", "omgili", "PetalBot",
  "Kangaroo Bot", "Scrapy", "python-requests", "python-urllib", "aiohttp", "httpx", "curl/", "Wget", "HeadlessChrome",
  "PhantomJS", "Puppeteer", "Playwright", "Selenium", "node-fetch", "axios/", "undici", "Go-http-client", "Java/",
  "libwww", "okhttp", "Firecrawl", "Jina-", "Browserbase", "ExaBot", "shapbot", "v0bot", "SemrushBot",
  "AhrefsBot", "MJ12bot", "DotBot", "DataForSeoBot", "Barkrowler", "BLEXBot", "serpstat", "zoominfo", "Crawler",
  "Spider", "crawl", "scraper", "Googlebot", "bingbot", "YandexBot", "DuckDuckBot", "Slurp", "Sogou", "SeznamBot",
  "Qwantbot", "Twitterbot", "LinkedInBot", "Pinterest", "facebookexternalhit", "redditbot", "Slackbot",
].join("|"), "i");
// İzin verilenler: bağlantı önizlemeleri (WhatsApp/Telegram/Discord), zamanlayıcı, kendi Windows uygulamamız
const ALLOW = /WhatsApp|TelegramBot|Discordbot|cron-job\.org|KOHesap\/|KOEkip\//i;

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const ua = req.headers.get("user-agent") || "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get("host") || "");
  const page = SITE[pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname];

  // ---- herkese açık tanıtım sitesi ----
  if (page || PUBLIC_FILE.test(pathname)) {
    if (!local && TRAIN.test(ua) && !ALLOW.test(ua)) return deny();
    // eski bildirim / kısayol bağlantıları: /?p=boss → uygulama
    if (pathname === "/" && req.nextUrl.searchParams.has("p")) return NextResponse.redirect(new URL("/app" + search, req.url), 307);
    if (page) {
      const res = NextResponse.rewrite(new URL(`/site/${page}.html`, req.url));
      res.headers.set("X-Robots-Tag", "index, follow, max-image-preview:large");
      res.headers.set("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
      return res;
    }
    const res = NextResponse.next();
    // aynı sayfanın .html kopyası dizinlenmesin (asıl adres yukarıdaki temiz adres)
    if (/^\/site\/.*\.html$/.test(pathname)) res.headers.set("X-Robots-Tag", "noindex, follow");
    return res;
  }

  // ---- uygulama, API ve uygulama dosyaları: botlar kapıda ----
  if (!local && !ALLOW.test(ua) && (!ua || BLOCK.test(ua))) return deny();
  const closed = (res: NextResponse) => { res.headers.set("X-Robots-Tag", NOINDEX); return res; };
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return closed(NextResponse.next());
  if (pathname === "/app" || pathname === "/app/") return closed(NextResponse.rewrite(new URL("/kohesap-app/index.html" + search, req.url)));
  const old = OLD_LEGAL.exec(pathname);
  if (old) return NextResponse.redirect(new URL("/" + old[1], req.url), 308);
  return NextResponse.redirect(new URL("/" + search, req.url), 308);
}
function deny() {
  return new NextResponse("Erişim yok.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": NOINDEX, "Cache-Control": "no-store" } });
}

export const config = {
  // Next'in kendi derleme dosyaları hariç her şey (uygulama dosyaları ve API'ler dahil)
  matcher: ["/((?!_next/static|_next/image|_vercel).*)"],
};
