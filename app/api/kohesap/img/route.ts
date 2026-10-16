import { NextRequest } from "next/server";
import { fetchPassing } from "@/lib/kohesap-fetch";

export const runtime = "nodejs";

/**
 * KO Hesap item ikonları: enucuzgb'deki item / PUS görsellerini koruma
 * sayfasını geçerek getirir ve CDN'de uzun süre saklar. Yalnızca ikon
 * klasörlerine izin verilir.
 */
const ORIGIN = process.env.KOHESAP_MARKET_ORIGIN || "https://www.enucuzgb.com";
const ICON_PATH = /^\/(ItemIcon|img\/pus|img\/items?)\/[A-Za-z0-9_.\-]+\.(png|jpe?g|webp|gif)$/;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  if (!ICON_PATH.test(p)) return new Response("izin yok", { status: 400 });
  try {
    const { res, bytes } = await fetchPassing(new URL(p, ORIGIN), {
      binary: true,
      accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      referer: ORIGIN + "/",
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !bytes || !/^image\//i.test(ct)) {
      return new Response("bulunamadı", { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("hata", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
