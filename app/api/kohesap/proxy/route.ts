import { NextRequest, NextResponse } from "next/server";
import { hostAllowed } from "@/lib/kohesap";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const JS_COOKIE = /document\.cookie\s*=\s*["']([^=;"']+)=([^;"']*)/;
const JS_LOCATION = /location\.href\s*=\s*["']([^"']+)["']/;

/**
 * Sayfayı getirir. Site "DDoS koruması" ara sayfası gönderirse (JavaScript ile
 * çerez yazıp yönlendiren küçük sayfa), çerezi ekleyip gerçek sayfayı ister.
 */
async function fetchPassing(start: URL): Promise<{ res: Response; body: string }> {
  let url = start;
  const cookies: string[] = [];
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const body = (await res.text()).slice(0, 4_000_000);
    const ck = body.length < 6000 ? body.match(JS_COOKIE) : null;
    if (!ck) return { res, body };
    cookies.push(`${ck[1].trim()}=${ck[2].trim()}`);
    const loc = body.match(JS_LOCATION);
    if (loc) {
      const next = new URL(loc[1], url);
      if (!hostAllowed(next.hostname)) return { res, body };
      url = next;
    }
  }
  throw new Error("sitenin koruma sayfası geçilemedi");
}

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
