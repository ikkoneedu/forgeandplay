import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import { hasAccess, verifyUser } from "@/lib/koekip-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sesli sohbet için aktarma (TURN) sunucusu bilgileri.
 * Mobil operatörler (CGNAT) ve bazı ev modemleri doğrudan bağlantıya izin vermez;
 * o zaman ses bu sunucu üzerinden aktarılır. Yalnızca davetli üyelere verilir.
 *  - Cloudflare: CF_TURN_KEY_ID + CF_TURN_API_TOKEN (ayda 1000 GB ücretsiz)
 *  - Başka sağlayıcı: TURN_URLS (virgülle) + TURN_USERNAME + TURN_CREDENTIAL
 */
type Ice = { urls: string | string[]; username?: string; credential?: string };
let cache: { at: number; ice: Ice[] } | null = null;
const TTL_S = 12 * 3600;

async function cloudflare(): Promise<Ice[] | null> {
  const id = process.env.CF_TURN_KEY_ID, tok = process.env.CF_TURN_API_TOKEN;
  if (!id || !tok) return null;
  if (cache && Date.now() - cache.at < (TTL_S / 2) * 1000) return cache.ice;
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL_S }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`cloudflare ${r.status}`);
  const j = (await r.json()) as { iceServers?: Ice | Ice[] };
  const list = (Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [])
    // 53 numaralı port tarayıcılarda zaman aşımına düşer
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length);
  cache = { at: Date.now(), ice: list };
  return list;
}
function staticTurn(): Ice[] | null {
  const urls = (process.env.TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return null;
  return [{ urls, username: process.env.TURN_USERNAME || "", credential: process.env.TURN_CREDENTIAL || "" }];
}

async function handle(req: NextRequest) {
  const h = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401, headers: h });
  if (!(await hasAccess(u))) return NextResponse.json({ error: "Davet gerekli" }, { status: 403, headers: h });
  let ice: Ice[] = [];
  let src = "none";
  try {
    const cf = await cloudflare();
    if (cf && cf.length) { ice = cf; src = "cloudflare"; }
  } catch (e) {
    console.warn("TURN cloudflare", e);
  }
  const st = staticTurn();
  if (st) { ice = ice.concat(st); src = src === "none" ? "static" : src + "+static"; }
  return NextResponse.json({ iceServers: ice, src, ttl: TTL_S }, { headers: h });
}
export const GET = handle;
export const POST = handle;
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
