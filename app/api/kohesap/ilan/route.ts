import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/koekip-server";
import { corsHeaders } from "@/lib/kohesap";
import { fetchPassing } from "@/lib/kohesap-fetch";
import { bynogameFeedUrl, kopazarUrl, matcher, parseBynogameFeed, parseKopazar, SERVERS, type Kind, type Row } from "@/lib/ilan";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Site ilanları: GET /api/kohesap/ilan?kind=item|char&q=raptor&server=Zero
 * Yanıt: { ok, rows: Row[], sources: { site, ok, n, error? }[], at }
 * Yalnızca onaylı üyeler. Kaynak başına 3 dk önbellek (kaynağa az istek).
 */
const CACHE = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  if (CACHE.size > 80) CACHE.delete(CACHE.keys().next().value as string);
  return v;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const gate = await requireMember(req, cors);
  if (gate) return gate;
  const sp = req.nextUrl.searchParams;
  const kind: Kind = sp.get("kind") === "char" ? "char" : "item";
  const q = (sp.get("q") || "").trim().slice(0, 60);
  const server = SERVERS.includes(sp.get("server") || "") ? (sp.get("server") as string) : "";
  const match = matcher(q);
  const sources: { site: string; ok: boolean; n: number; error?: string }[] = [];
  const rows: Row[] = [];

  const kopazar = (async () => {
    try {
      // kelime araması sitede yapılır; "rev" / "+7" gibi ekler bizim süzgecimizde
      const kw = q.replace(/\b(rev(erse)?\.?)\b|\+\d+/gi, " ").replace(/\s+/g, " ").trim();
      const pages = await Promise.all([1, 2].map((p) => cached(`kz|${kind}|${kw}|${server}|${p}`, 180e3, async () => {
        const { res, body } = await fetchPassing(new URL(kopazarUrl(kind, kw, server, p)));
        if (!res.ok) throw new Error("HTTP " + res.status);
        return parseKopazar(body, kind);
      })));
      const seen = new Set<string>();
      const list = pages.flat().filter((r) => !seen.has(r.id || r.url) && seen.add(r.id || r.url)).filter((r) => (!server || r.server === server) && match(r));
      rows.push(...list); sources.push({ site: "Kopazar", ok: true, n: list.length });
    } catch (e) { sources.push({ site: "Kopazar", ok: false, n: 0, error: e instanceof Error ? e.message : String(e) }); }
  })();

  const bynogame = (async () => {
    try {
      const all = await cached(`bn|${kind}`, 180e3, async () => {
        const r = await fetch(bynogameFeedUrl(kind), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        return parseBynogameFeed(await r.json(), kind);
      });
      const list = all.filter((r) => (!server || r.server === server) && match(r));
      rows.push(...list); sources.push({ site: "ByNoGame", ok: true, n: list.length });
    } catch (e) { sources.push({ site: "ByNoGame", ok: false, n: 0, error: e instanceof Error ? e.message : String(e) }); }
  })();

  await Promise.all([kopazar, bynogame]);
  rows.sort((a, b) => a.price - b.price);
  return NextResponse.json({ ok: true, kind, q, server, rows: rows.slice(0, 400), sources, at: Date.now() }, { headers: { ...cors, "Cache-Control": "private, max-age=60" } });
}
