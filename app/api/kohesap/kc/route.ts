import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import { fetchPassing } from "@/lib/kohesap-fetch";
import { pairs, pick, stripHtml } from "@/lib/kc-price";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Güncel Knight Cash (KC) fiyatı: satış sitelerinden paket fiyatlarını okur,
 * 400 KC'nin TL fiyatını çıkarır. 6 saat önbellek; kaynaklar sırayla denenir.
 * Yanıt: { ok, kc: 400, tl: 227.5, rate, src, at }
 */
type KC = { ok: true; kc: number; tl: number; rate: number; src: string; at: number };
let cache: KC | null = null;
const TTL = 6 * 3600e3;

const SOURCES = [
  { name: "oyuneks.com", url: "https://oyuneks.com/knight-online-world/knight-online-cash" },
  { name: "bynogame.com", url: "https://www.bynogame.com/en/games/knight-online/knight-online-premium-cash/3200-cash" },
  { name: "knightpin.com", url: "https://knightpin.com/blog/knight-online-cash-fiyatlari" },
];

export async function GET(req: NextRequest) {
  const h = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "public, s-maxage=3600" };
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache, { headers: h });
  for (const s of SOURCES) {
    try {
      const { res, body } = await fetchPassing(new URL(s.url));
      if (!res.ok) continue;
      const p = pick(pairs(stripHtml(body)));
      if (p) {
        cache = { ok: true, kc: p.kc, tl: p.tl, rate: p.tl / p.kc, src: s.name, at: Date.now() };
        return NextResponse.json(cache, { headers: h });
      }
    } catch { /* sıradaki kaynak */ }
  }
  if (cache) return NextResponse.json(cache, { headers: h });
  return NextResponse.json({ ok: false, error: "KC fiyatı okunamadı" }, { status: 502, headers: { ...h, "Cache-Control": "no-store" } });
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
