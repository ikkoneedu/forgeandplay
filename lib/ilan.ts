/**
 * KO Ekip — site ilanları (item + karakter) okuyucuları.
 * Sunucudan (Vercel) okunabilen kaynaklar: Kopazar (HTML), ByNoGame (açık ilan akışı).
 * Bot korumalı siteler (Knightpin, Oyuneks, ByNoGame arama) Windows uygulamasının
 * tarayıcısıyla, istemci tarafında okunur (public/kohesap-app/ilan.js).
 */
export type Kind = "item" | "char";
export type Row = {
  site: string; kind: Kind; name: string; server: string; price: number; url: string;
  grade?: string; plus?: number; seller?: string; sub?: string; np?: string; lvl?: string; cls?: string; at?: string; id?: string;
};
export const SERVERS = ["Zero", "Agartha", "Pandora", "Felis", "Dryads", "Destan", "Minark", "Oreads", "Zion"];

const ent = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const clean = (s: string) => ent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** "2.678,00" / "2.678" → 2678 */
export const trNum = (s: string) => { const t = String(s).replace(/[^\d.,]/g, ""); return Number(t.replace(/\./g, "").replace(",", ".")) || 0; };
const plusOf = (n: string) => { const m = n.match(/\+\s?(\d{1,2})\b/); return m ? +m[1] : undefined; };
const normSrv = (s: string) => SERVERS.find((x) => x.toLowerCase() === String(s).trim().toLowerCase()) || String(s).trim();
/** "rev raptor" araması: kelimelerin hepsi geçmeli, "rev"/"reverse" derece filtresidir */
export function matcher(q: string) {
  const words = q.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/[^a-z0-9ğüşöç+ ]/g, " ").split(/\s+/).filter(Boolean);
  const rev = words.some((w) => /^rev(erse)?$/.test(w));
  const plus = words.find((w) => /^\+\d+$/.test(w));
  const rest = words.filter((w) => !/^rev(erse)?$/.test(w) && !/^\+\d+$/.test(w));
  return (r: Row) => {
    const n = (r.name + " " + (r.sub || "")).toLocaleLowerCase("tr").replace(/ı/g, "i");
    if (rest.some((w) => !n.includes(w))) return false;
    if (rev && !/rev/i.test(r.name + " " + (r.grade || ""))) return false;
    if (plus && r.plus !== +plus.slice(1)) return false;
    return true;
  };
}

/* ---------------- Kopazar ---------------- */
const KZ_ITEM_SRV: Record<string, number> = { Dryads: 1, Minark: 5, Oreads: 6, Destan: 94, Pandora: 128, Agartha: 129, Felis: 130, Zero: 136, Zion: 139 };
const KZ_CHAR_SRV: Record<string, number> = { Dryads: 40, Minark: 43, Destan: 46, Oreads: 50, Pandora: 133, Agartha: 134, Felis: 135, Zero: 137, Zion: 138 };
export function kopazarUrl(kind: Kind, q: string, server: string, page = 1) {
  const base = kind === "item" ? "https://www.kopazar.com/knight-online-item" : "https://www.kopazar.com/knight-online-cypher-ring";
  const p = new URLSearchParams({ page: String(page), sort: "cheap", keyword: q });
  const id = (kind === "item" ? KZ_ITEM_SRV : KZ_CHAR_SRV)[server];
  if (id) p.set(kind === "item" ? "knightserver" : "cypherserver", String(id));
  return `${base}?${p}`;
}
export function parseKopazar(html: string, kind: Kind): Row[] {
  const out: Row[] = [];
  const re = /<a href="(\/knight-online-(?:item|cypher-ring)\/(\d+)[^"]*)"[^>]*class="card (?:item|ring)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const c = m[4];
    const title = clean((c.match(/<strong class="item-[^"]*"[^>]*>([\s\S]*?)<\/strong>/) || [])[1] || "");
    const sub = clean((c.match(/<div class="item-title"[\s\S]*?<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "");
    const sv = c.match(/class="item-server[^"]*">\s*<strong>([^<]+)<\/strong>\s*(?:<span>([^<]*)<\/span>)?/);
    const pr = c.match(/card-price">([\d.]+)(?:<sup>,(\d+))?/);
    const price = pr ? trNum(pr[1] + (pr[2] ? "," + pr[2] : "")) : 0;
    if (!title || !price) continue;
    const row: Row = { site: "Kopazar", kind, name: title, server: normSrv(sv ? sv[1] : ""), price, url: "https://www.kopazar.com" + m[1], id: m[2] };
    if (kind === "item") { row.grade = sv && sv[2] ? clean(sv[2]) : /reverse/i.test(title) ? "Reverse" : ""; row.plus = plusOf(title); row.sub = sub; }
    else {
      const np = c.match(/<strong>Np<\/strong>\s*<span>([^<]+)/i);
      const slug = m[1].replace(/^.*\/\d+-/, "");
      const r1 = slug.match(/^(\d{2})-reb-(\d{1,2})\b/) || slug.match(/^(\d{2})-(\d{1,2})-/);
      const lv = r1 && +r1[2] <= 15 ? `${r1[1]}/${r1[2]}` : (slug.match(/^(\d{2})-(?:lv|lvl|level)\b/) || [])[1];
      row.np = np ? np[1] : undefined; row.lvl = lv; row.cls = title; row.sub = sub || clean(m[3]).replace(/^Knight Online Char - /, "");
    }
    out.push(row);
  }
  return out;
}

/* ---------------- ByNoGame (açık ilan akışı: son eklenen / güncellenen ~1000 ilan) ---------------- */
type BnItem = { listingId: number; name: string; price: number; slug: string; label: string; productGrade?: string; productClasses?: string; updatedAt?: string; info?: Record<string, string> };
export const bynogameFeedUrl = (kind: Kind) => `https://listing.bynogame.net/api/listings/${kind === "item" ? "ko" : "koring"}?page=0&limit=1000`;
export function parseBynogameFeed(json: unknown, kind: Kind): Row[] {
  const list = ((json as { payload?: BnItem[] })?.payload || []) as BnItem[];
  const seen = new Set<number>(); const out: Row[] = [];
  for (const x of list) {
    if (!x || seen.has(x.listingId)) continue;
    seen.add(x.listingId);
    if (x.label === "sold" || !(x.price > 0)) continue;
    const info = x.info || {};
    const name = ent(String(x.name || ""));
    const row: Row = { site: "ByNoGame", kind, name, server: normSrv(info.marketHashNameBare || ""), price: x.price, url: `https://www.bynogame.com/tr/oyunlar/knight-online/${x.slug}`, at: x.updatedAt, id: String(x.listingId) };
    if (kind === "item") { row.plus = plusOf(name); row.grade = /rev/i.test(name) ? "Reverse" : ""; row.sub = (x.productClasses || "").trim(); }
    else {
      const lr = String(info.levelReb || "");
      row.lvl = lr.length >= 3 ? (+lr.slice(2) ? `${lr.slice(0, 2)}/${+lr.slice(2)}` : lr.slice(0, 2)) : lr;
      row.cls = [info.classStr, info.factionStr].filter(Boolean).join(" - ");
      const np = +info.nationalPoints || 0; row.np = np ? (np >= 1e6 ? (np / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : Math.round(np / 1e3) + "K") : undefined;
      row.name = `${row.cls || "Karakter"} ${row.lvl || ""}`.trim();
      row.sub = name.split(" - ").slice(3).join(" · ");
    }
    out.push(row);
  }
  return out;
}
