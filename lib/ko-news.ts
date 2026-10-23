/**
 * KO Ekip — Knight Online yeni sunucu haberleri (sunucu tarafı toplayıcı).
 * Birkaç kaynaktan başlıkları toplar, Knight Online ile ilgili olanları ayıklar,
 * kohesapAssets/news belgesine yazar (üyeler canlı okur). Zamanlayıcı (cron) her
 * 10 dakikada bir yeniler; yeni sunucuyla ilgili yeni bir haber gelirse bildirim gider.
 * Kaynaklardan biri kapanır / yapısını değiştirirse yalnızca o kaynak boş kalır.
 */
import { createHash } from "node:crypto";
import editorialNews from "./ko-news-editorial.json";
import type { Firestore } from "firebase-admin/firestore";
import { BROWSER_UA } from "@/lib/kohesap-fetch";

export type NewsItem = {
  id: string; t: string; u: string; src: string; d?: string;
  at: number;      // ilk görüldüğü an (ms)
  pub?: number;    // kaynağın verdiği yayın tarihi (varsa)
  yeni?: boolean;  // yeni sunucu ile ilgili
  off?: boolean;   // resmî kaynak
};
type Source =
  | { id: string; name: string; kind: "rss"; url: string }
  | { id: string; name: string; kind: "links"; url: string; base: string; re: RegExp }
  | { id: string; name: string; kind: "watch"; url: string };

export const NEWS_SOURCES: Source[] = [
  { id: "ntt", name: "NTT Game (resmî)", kind: "watch", url: "https://www.nttgame.com/knight/tr/newserveropen2026" },
  { id: "gnews", name: "Google Haberler", kind: "rss", url: "https://news.google.com/rss/search?q=%22Knight+Online%22+(sunucu+OR+server+OR+%22%C3%B6n+kay%C4%B1t%22)+when:30d&hl=tr&gl=TR&ceid=TR:tr" },
  { id: "kopazar", name: "Kopazar", kind: "links", url: "https://www.kopazar.com/blog", base: "https://www.kopazar.com", re: /^\/blog\/[a-z0-9-]+\/?$/ },
  { id: "bynogame", name: "ByNoGame", kind: "links", url: "https://blog.bynogame.com/news", base: "https://blog.bynogame.com", re: /\/(news|blog)\/[a-z0-9-]+-\d+\/?$/ },
  { id: "korehberi", name: "KO Rehberi", kind: "links", url: "https://korehberi.com/kategori/haberler", base: "https://korehberi.com", re: /korehberi\.com\/(haberler|genel|duyurular)\/[a-z0-9-]+\/?$|^\/(haberler|genel|duyurular)\/[a-z0-9-]+\/?$/ },
  { id: "oyuneks", name: "Oyuneks", kind: "links", url: "https://oyuneks.com/blog", base: "https://oyuneks.com", re: /^(https:\/\/oyuneks\.com)?\/blog\/[a-z0-9-]+\/?$/ },
];

const KO = /knight\s*online|\bko\b/i;
const NEW_SRV = /yeni\s*(sunucu|server)|ön[\s-]*kayıt|on[\s-]*kayit|\botp\+?|açıl(ış|ıyor|di|dı)|birleş|seviye\s*sınır|level\s*(cap|sınır)|\bcap\b|karakter\s*oluştur|server\s*seç|sunucu\s*seç/i;

const unesc = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const text = (s: string) => unesc(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const hid = (u: string) => createHash("sha1").update(u).digest("hex").slice(0, 16);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

async function get(url: string, ms = 9000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": BROWSER_UA, "Accept-Language": "tr-TR,tr;q=0.9", Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8" }, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** RSS (Google Haberler biçimi dahil) */
export function parseRss(xml: string, src: string): Omit<NewsItem, "at">[] {
  const out: Omit<NewsItem, "at">[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const tag = (n: string) => { const x = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i").exec(it); return x ? unesc(x[1]).trim() : ""; };
    let t = text(tag("title")); const u = tag("link") || tag("guid");
    const from = text(tag("source"));
    if (from && t.endsWith(" - " + from)) t = t.slice(0, -(from.length + 3));
    if (!t || !/^https?:\/\//.test(u)) continue;
    const pub = Date.parse(tag("pubDate")) || undefined;
    out.push({ id: hid(u), t: clip(t, 160), u, src: from ? `${from}` : src, pub });
  }
  return out;
}

/** Blog listesi: makale bağlantıları ve başlıkları (başlık etiketi > alt/title > metnin başı) */
export function parseLinks(html: string, base: string, re: RegExp, src: string): Omit<NewsItem, "at">[] {
  const seen = new Map<string, Omit<NewsItem, "at">>();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1], inner = m[2];
    const href = (/href\s*=\s*["']([^"'#?]+)/i.exec(attrs) || [])[1];
    if (!href || !re.test(href)) continue;
    const u = href.startsWith("http") ? href : base + (href.startsWith("/") ? "" : "/") + href;
    const h = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(inner) || /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(inner);
    let t = h ? text(h[2]) : "";
    let d = "";
    const all = text(inner);
    if (!t) t = text((/title\s*=\s*["']([^"']+)/i.exec(attrs) || [])[1] || "");
    if (!t && all) { const cut = all.search(/[!?.](\s|$)/); t = cut > 25 && cut < 150 ? all.slice(0, cut + 1) : all.slice(0, 140); }
    if (h && all.length > t.length + 10) d = clip(all.replace(t, "").trim(), 200);
    if (!t || t.length < 12) continue;
    const prev = seen.get(u);
    if (!prev || prev.t.length < t.length) seen.set(u, { id: hid(u), t: clip(t, 160), u, src, d: d || prev?.d });
  }
  return [...seen.values()];
}

export type NewsDoc = { items: NewsItem[]; at: number; src?: Record<string, { ok: boolean; n: number; err?: string; at: number }>; ntt?: { h: string; at: number } };

/** Kaynakları tarar, belgeyle birleştirir; yeni eklenenleri döndürür. */
export async function refreshNews(db: Firestore): Promise<{ doc: NewsDoc; fresh: NewsItem[]; first: boolean }> {
  const ref = db.doc("kohesapAssets/news");
  const snap = await ref.get();
  const first = !snap.exists;
  const old: NewsDoc = (snap.data() as NewsDoc) || { items: [], at: 0 };
  const known = new Map(old.items.map((x) => [x.id, x]));
  const now = Date.now();
  const status: NewsDoc["src"] = { ...(old.src || {}) };
  let ntt = old.ntt;
  const found: Omit<NewsItem, "at">[] = [...editorialNews];
  // Stable IDs let reviewed summaries be corrected without duplicate notifications.
  for (const article of editorialNews) {
    const existing = known.get(article.id);
    if (existing) known.set(article.id, { ...existing, ...article });
  }

  await Promise.all(NEWS_SOURCES.map(async (s) => {
    try {
      const body = await get(s.url);
      let list: Omit<NewsItem, "at">[] = [];
      if (s.kind === "rss") list = parseRss(body, s.name).filter((x) => KO.test(x.t));
      else if (s.kind === "links") list = parseLinks(body, s.base, s.re, s.name).filter((x) => KO.test(x.t));
      else {
        // resmî sayfa: metin değişirse "güncellendi" haberi
        const txt = text(body).replace(/\d{1,2}:\d{2}:\d{2}/g, "");
        const h = createHash("sha1").update(txt).digest("hex").slice(0, 20);
        if (ntt && ntt.h !== h && txt.length > 200 && now - ntt.at > 3 * 3600e3)
          list = [{ id: "ntt-" + h, t: "Resmî yeni sunucu sayfası güncellendi (NTT Game)", u: s.url, src: s.name, off: true, yeni: true, pub: now }];
        if (!ntt || ntt.h !== h) ntt = { h, at: now };
      }
      found.push(...list);
      status[s.id] = { ok: true, n: list.length, at: now };
    } catch (e) {
      status[s.id] = { ok: false, n: 0, err: String((e as Error).message || e).slice(0, 80), at: now };
    }
  }));

  const fresh: NewsItem[] = [];
  // aynı başlık birden çok kaynakta: ilkini tut
  const titleKey = (t: string) => t.toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]+/g, " ").trim().slice(0, 70);
  const titles = new Set(old.items.map((x) => titleKey(x.t)));
  for (const f of found) {
    if (known.has(f.id)) { const k = known.get(f.id)!; if (f.d && !k.d) k.d = f.d; continue; }
    const tk = titleKey(f.t);
    if (titles.has(tk)) continue;
    titles.add(tk);
    const it: NewsItem = { ...f, at: now, yeni: f.yeni ?? NEW_SRV.test(f.t + " " + (f.d || "")) };
    if (it.pub && it.pub > now + 864e5) delete it.pub;
    known.set(it.id, it); fresh.push(it);
  }
  const items = [...known.values()]
    .sort((a, b) => (b.pub || b.at) - (a.pub || a.at))
    .slice(0, 80)
    .map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as NewsItem);
  const doc: NewsDoc = { items, at: now, src: status, ...(ntt ? { ntt } : {}) };
  await ref.set(doc);
  return { doc, fresh, first };
}
