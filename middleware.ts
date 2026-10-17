import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * forgeandplay.com → KO Ekip
 *  1) Yapay zekâ tarayıcıları, kazıyıcılar ve otomatik araçlar engellenir (403).
 *  2) "/" → KO Ekip uygulaması; eski site sayfaları "/"e yönlenir (yasal sayfalar kalır).
 * Asıl koruma: veriler yalnızca Google ile giriş yapıp admin onayı alanlara açıktır
 * (Firestore kuralları + API kimlik kontrolü). Bu katman botları kapıda çevirir.
 */
const intl = createMiddleware(routing);
const KEEP = /^\/(tr|en|es|zh)\/(gizlilik|kullanim-sartlari|iletisim)\/?$/;

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
  if (!local && !ALLOW.test(ua) && (!ua || BLOCK.test(ua))) {
    return new NextResponse("Erişim yok.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow, noarchive, noai, noimageai", "Cache-Control": "no-store" } });
  }
  // API ve dosyalar: yalnızca bot süzgeci
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
  if (pathname === "/") return NextResponse.rewrite(new URL("/kohesap-app/index.html" + search, req.url));
  if (KEEP.test(pathname)) return intl(req);
  return NextResponse.redirect(new URL("/" + search, req.url), 308);
}

export const config = {
  // Next'in kendi derleme dosyaları hariç her şey (uygulama dosyaları ve API'ler dahil)
  matcher: ["/((?!_next/static|_next/image|_vercel).*)"],
};
