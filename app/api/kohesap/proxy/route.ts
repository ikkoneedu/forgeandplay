import { NextRequest, NextResponse } from "next/server";
import { hostAllowed } from "@/lib/kohesap";
import { JS_COOKIE, fetchPassing } from "@/lib/kohesap-fetch";

export const runtime = "nodejs";

/**
 * KO Hesap web sürümü için sınırlı proxy: yalnızca izinli alan adlarındaki
 * herkese açık sayfaları (GB fiyat tablosu vb.) getirir. Sonuç 5 dk CDN'de
 * önbelleğe alınır; böylece tüm kullanıcılar için kaynağa az istek gider.
 */
export async function GET(req: NextRequest) {
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
  try {
    const { res, body } = await fetchPassing(target);
    return NextResponse.json(
      { ok: res.ok, status: res.status, html: body, error: res.ok ? "" : `Site ${res.status} hata kodu döndürdü.`, mode: "dogrudan" },
      {
        status: res.ok ? 200 : 502,
        headers: { "Cache-Control": res.ok && !JS_COOKIE.test(body.slice(0, 6000)) ? "public, s-maxage=300, stale-while-revalidate=600" : "no-store" },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Bağlantı hatası: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
