import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/koekip-server";
import { corsHeaders } from "@/lib/kohesap";
import { fetchPassing } from "@/lib/kohesap-fetch";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * KO Hesap item detayı (web): oyun içi tooltip ve fiyat geçmişi.
 * enucuzgb'nin canlı pazar sayfasının kullandığı iç adreslerden okunur.
 */
const ORIGIN = process.env.KOHESAP_MARKET_ORIGIN || "https://www.enucuzgb.com";
const PAGE = `${ORIGIN}/canlipazar`;
const cache = new Map<string, { at: number; body: string }>();
const TTL = 10 * 60_000;

const ok = (v: string | null, re: RegExp) => (v && re.test(v) ? v : "");

export async function GET(req: NextRequest) {
  // yalnızca onaylı KO Ekip üyeleri (dış site kaynaklarını korur, kötüye kullanımı engeller)
  const gate = await requireMember(req, corsHeaders(req.headers.get("origin")));
  if (gate) return gate;
  const q = req.nextUrl.searchParams;
  const headers = { ...corsHeaders(req.headers.get("origin")) };
  const action = ok(q.get("action"), /^(price_history|channel_compare|tooltip)$/);
  const itemId = ok(q.get("itemId"), /^\d{1,12}$/);
  if (!action || !itemId) return NextResponse.json({ ok: false, error: "geçersiz istek" }, { status: 400, headers });
  const url =
    action === "tooltip"
      ? new URL(`${ORIGIN}/api/market/tooltip?itemId=${itemId}`)
      : new URL(
          `${ORIGIN}/api/market/item?` +
            new URLSearchParams({
              action,
              itemId,
              server: ok((q.get("server") ?? "").toUpperCase().replace(/-/g, ""), /^[A-Z0-9]{1,20}$/),
              mType: ok(q.get("mType"), /^\d$/) || "0",
            })
        );
  const key = url.toString();
  const hit = cache.get(key);
  let body = hit && Date.now() - hit.at < TTL ? hit.body : "";
  try {
    if (!body) {
      const opts = { accept: "application/json, text/plain, */*", referer: PAGE, xhr: true };
      let r = await fetchPassing(url, opts);
      if (!r.res.ok || !/^\s*[[{]/.test(r.body)) {
        await fetchPassing(new URL(PAGE)).catch(() => null);
        r = await fetchPassing(url, opts);
      }
      if (!r.res.ok || !/^\s*[[{]/.test(r.body)) throw new Error(`site ${r.res.status}`);
      body = r.body;
      cache.set(key, { at: Date.now(), body });
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    }
    return new NextResponse(body, {
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: { ...headers, "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
