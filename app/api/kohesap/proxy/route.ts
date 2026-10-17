import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/koekip-server";
import { corsHeaders } from "@/lib/kohesap";
import { hostAllowed } from "@/lib/kohesap";
import { JS_COOKIE, fetchPassing } from "@/lib/kohesap-fetch";

export const runtime = "nodejs";

/**
 * KO Hesap web sürümü için sınırlı proxy: yalnızca izinli alan adlarındaki
 * herkese açık sayfaları (GB fiyat tablosu vb.) getirir. Sonuç 5 dk CDN'de
 * önbelleğe alınır; böylece tüm kullanıcılar için kaynağa az istek gider.
 */
const PCACHE = new Map<string, { at: number; body: string }>();
export async function GET(req: NextRequest) {
  // yalnızca onaylı KO Ekip üyeleri (dış site kaynaklarını korur, kötüye kullanımı engeller)
  const gate = await requireMember(req, corsHeaders(req.headers.get("origin")));
  if (gate) return gate;
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz adres" }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || !hostAllowed(target.hostname)) {
    return NextResponse.json({ ok: false, error: "Bu adrese izin verilmiyor" }, { status: 403 });
  }
  // 5 dk sunucu önbelleği (üyelerin hepsi aynı sayfayı ister; kaynağa az istek gider)
  const key = target.toString(), hit = PCACHE.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) {
    return NextResponse.json({ ok: true, status: 200, html: hit.body, error: "", mode: "dogrudan" }, { headers: { "Cache-Control": "private, max-age=120" } });
  }
  try {
    const { res, body } = await fetchPassing(target);
    if (res.ok && !JS_COOKIE.test(body.slice(0, 6000))) { PCACHE.set(key, { at: Date.now(), body }); if (PCACHE.size > 30) PCACHE.delete(PCACHE.keys().next().value as string); }
    return NextResponse.json(
      { ok: res.ok, status: res.status, html: body, error: res.ok ? "" : `Site ${res.status} hata kodu döndürdü.`, mode: "dogrudan" },
      {
        status: res.ok ? 200 : 502,
        headers: { "Cache-Control": res.ok && !JS_COOKIE.test(body.slice(0, 6000)) ? "private, max-age=120" : "no-store" },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Bağlantı hatası: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
