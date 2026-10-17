import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/koekip-server";
import { corsHeaders } from "@/lib/kohesap";
import { fetchPassing } from "@/lib/kohesap-fetch";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * KO Hesap canlı pazar (web): enucuzgb'nin canlı pazar sayfasının kullandığı
 * iç adresten ilanları alır, 60 sn önbellekte tutar ve istemciye yalnızca
 * istenen sayfayı gönderir (tüm liste yüzlerce KB olabilir).
 */
const ORIGIN = process.env.KOHESAP_MARKET_ORIGIN || "https://www.enucuzgb.com";
const PAGE = `${ORIGIN}/canlipazar`;
const TTL = 60_000;
type Item = Record<string, unknown>;
const cache = new Map<string, { at: number; items: Item[]; total: number; searches: number | null }>();

const clean = (v: string | null, re: RegExp, max = 40) => {
  const s = (v ?? "").trim().slice(0, max);
  return re.test(s) ? s : "";
};

async function loadAll(params: URLSearchParams) {
  const key = params.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ...hit, cached: true };
  const url = new URL(`${ORIGIN}/api/market/ares?${key}`);
  let { res, body } = await fetchPassing(url, { accept: "application/json, text/plain, */*", referer: PAGE, xhr: true });
  if (!res.ok || !body.trim().startsWith("{") && !body.trim().startsWith("[")) {
    // çerez / oturum için önce sayfayı açıp tekrar dene
    await fetchPassing(new URL(PAGE)).catch(() => null);
    ({ res, body } = await fetchPassing(url, { accept: "application/json, text/plain, */*", referer: PAGE, xhr: true }));
  }
  if (!res.ok) throw Object.assign(new Error(`site ${res.status}`), { status: res.status, sample: body.slice(0, 300) });
  let j: unknown;
  try { j = JSON.parse(body); } catch { throw Object.assign(new Error("site JSON dönmedi"), { status: 502, sample: body.slice(0, 300) }); }
  const obj = j as { items?: Item[]; total_count?: number; total_searches?: number };
  const items: Item[] = Array.isArray(j) ? (j as Item[]) : Array.isArray(obj.items) ? obj.items : [];
  const entry = { at: Date.now(), items, total: typeof obj.total_count === "number" ? obj.total_count : items.length, searches: typeof obj.total_searches === "number" ? obj.total_searches : null };
  cache.set(key, entry);
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return { ...entry, cached: false };
}

export async function GET(req: NextRequest) {
  // yalnızca onaylı KO Ekip üyeleri (dış site kaynaklarını korur, kötüye kullanımı engeller)
  const gate = await requireMember(req, corsHeaders(req.headers.get("origin")));
  if (gate) return gate;
  const q = req.nextUrl.searchParams;
  // sitenin kendi sayfasının gönderdiği parametrelerin aynısı (doğrulanmış)
  const params = new URLSearchParams({
    query: (q.get("query") ?? "").slice(0, 60),
    minPrice: clean(q.get("minPrice"), /^\d*$/, 15),
    maxPrice: clean(q.get("maxPrice"), /^\d*$/, 15),
    server: clean((q.get("server") ?? "").toUpperCase().replace(/-/g, ""), /^[A-Z0-9]*$/, 32),
    grade: clean(q.get("grade"), /^(?:|n(?:[1-9]|10)|reb(?:[1-9]|1\d|2[01]))$/),
    type: q.get("type") === "buy" ? "buy" : "sell",
    priceshort: q.get("priceshort") === "asc" ? "asc" : "desc",
    stats: "",
  });
  const per = Math.min(200, Math.max(10, Number(q.get("per")) || 50));
  const page = Math.max(1, Number(q.get("page")) || 1);
  const headers = { ...corsHeaders(req.headers.get("origin")) };
  try {
    const all = await loadAll(params);
    const pages = Math.max(1, Math.ceil(all.items.length / per));
    const p = Math.min(page, pages);
    return NextResponse.json(
      { ok: true, total: all.total, count: all.items.length, page: p, pages, per, searches: all.searches, at: all.at, items: all.items.slice((p - 1) * per, p * per) },
      { headers: { ...headers, "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    const err = e as Error & { status?: number; sample?: string };
    return NextResponse.json(
      { ok: false, error: err.message, status: err.status ?? 502, sample: err.sample ?? "" },
      { status: 502, headers: { ...headers, "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
