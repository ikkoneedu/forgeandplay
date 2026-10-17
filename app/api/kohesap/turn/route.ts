import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, env, hasAccess, trParts, verifyUser } from "@/lib/koekip-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sesli sohbet için aktarma (TURN) sunucusu bilgileri.
 * Mobil operatörler (CGNAT) ve bazı ev modemleri doğrudan bağlantıya izin vermez;
 * o zaman ses bu sunucu üzerinden aktarılır. Yalnızca davetli üyelere verilir.
 *  - Cloudflare: CF_TURN_KEY_ID + CF_TURN_API_TOKEN (ayda 1000 GB ücretsiz)
 *  - Başka sağlayıcı: TURN_URLS (virgülle) + TURN_USERNAME + TURN_CREDENTIAL
 *
 * AYLIK SINIR: istemciler aktarma üzerinden geçen veriyi bildirir (POST {used: bayt});
 * toplam kohesapAssets/turnUsage belgesinde tutulur. Sınıra (varsayılan 800 GB; admin
 * uygulamadan değiştirir, TURN_LIMIT_GB ile de verilebilir) ulaşılınca bu ay için artık
 * aktarma bilgisi verilmez ve açık bağlantılar kapanır → ücretli kısma hiç geçilmez.
 */
const monthKey = () => { const p = trParts(Date.now()); return `${p.y}-${String(p.m + 1).padStart(2, "0")}`; };
const defLimitGB = () => Math.max(1, Math.min(1000, Number(env("TURN_LIMIT_GB")) || 800));
type Usage = { month: string; bytes: number; limitGB: number; over: boolean };
async function usage(): Promise<Usage | null> {
  const db = adminDb(); if (!db) return null;
  const s = await db.doc("kohesapAssets/turnUsage").get();
  const d = (s.data() || {}) as { month?: string; bytes?: number; limitGB?: number };
  const month = monthKey();
  const bytes = d.month === month ? Number(d.bytes) || 0 : 0;
  const limitGB = Math.max(1, Math.min(1000, Number(d.limitGB) || defLimitGB()));
  return { month, bytes, limitGB, over: bytes >= limitGB * 1e9 };
}
async function addUsage(n: number) {
  const db = adminDb(); if (!db) return;
  const ref = db.doc("kohesapAssets/turnUsage"), month = monthKey();
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists || s.get("month") !== month) t.set(ref, { month, bytes: n, at: Date.now(), limitGB: s.exists ? s.get("limitGB") || defLimitGB() : defLimitGB() }, { merge: true });
    else t.update(ref, { bytes: FieldValue.increment(n), at: Date.now() });
  });
}
type Ice = { urls: string | string[]; username?: string; credential?: string };
let cache: { at: number; ice: Ice[] } | null = null;
const TTL_S = 12 * 3600;

async function cloudflare(): Promise<Ice[] | null> {
  const id = env("CF_TURN_KEY_ID"), tok = env("CF_TURN_API_TOKEN");
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
  const urls = env("TURN_URLS").split(",").map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return null;
  return [{ urls, username: env("TURN_USERNAME"), credential: env("TURN_CREDENTIAL") }];
}

async function handle(req: NextRequest) {
  const h = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401, headers: h });
  if (!(await hasAccess(u))) return NextResponse.json({ error: "Davet gerekli" }, { status: 403, headers: h });
  // kullanım bildirimi: { used: bayt } (bir seferde en fazla 2 GB kabul edilir)
  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { used?: number } | null;
    const used = body && Number(body.used);
    if (used && used > 0) await addUsage(Math.min(used, 2e9)).catch((e) => console.warn("TURN kullanım", e));
  }
  const us = await usage().catch(() => null);
  const usageOut = us ? { month: us.month, gb: Math.round(us.bytes / 1e7) / 100, limitGB: us.limitGB, over: us.over } : null;
  if (us && us.over) return NextResponse.json({ iceServers: [], src: "limit", usage: usageOut }, { headers: h });
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
  return NextResponse.json({ iceServers: ice, src, ttl: TTL_S, usage: usageOut }, { headers: h });
}
export const GET = handle;
export const POST = handle;
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
