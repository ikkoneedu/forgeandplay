import { NextRequest, NextResponse } from "next/server";
import editorialNews from "@/lib/ko-news-editorial.json";
import { corsHeaders } from "@/lib/kohesap";
import { adminDb, requireMember } from "@/lib/koekip-server";
import { refreshNews, type NewsDoc } from "@/lib/ko-news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Yeni sunucu haberleri (üyelere). Belge 10 dakikadan eskiyse kaynaklar yeniden taranır.
 * Uygulama kohesapAssets/news belgesini canlı da izler; bu adres ilk açılışta tazeler.
 */
let busy: Promise<unknown> | null = null;
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  // tanıtım sayfası: herkese açık son başlıklar (yalnızca başlık, kaynak, bağlantı)
  const pub = req.nextUrl.searchParams.get("pub") === "1" && !req.headers.get("authorization");
  const gate = pub ? null : await requireMember(req, cors);
  if (gate) return gate;
  const db = adminDb();
  // Reviewed public news remains available when the database is not configured.
  if (!db && pub) {
    const items = [...editorialNews].sort((a, b) => b.pub - a.pub).slice(0, 8)
      .map(({ t, u, src, pub: p, yeni, off }) => ({ t, u, src, at: p, pub: p, yeni, off }));
    return NextResponse.json({ ok: true, at: 0, items }, {
      headers: { ...cors, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  }
  if (!db) return NextResponse.json({ ok: false, error: "Sunucuda FIREBASE_SERVICE_ACCOUNT tanımlı değil" }, { status: 503, headers: cors });
  const s = await db.doc("kohesapAssets/news").get();
  let doc = (s.data() as NewsDoc) || null;
  if (!doc || Date.now() - doc.at > 10 * 60e3) {
    busy = busy || refreshNews(db).finally(() => { busy = null; });
    const r = (await busy.catch(() => null)) as { doc: NewsDoc } | null;
    if (r) doc = r.doc;
  }
  if (pub) {
    const items = ((doc && doc.items) || []).slice(0, 8).map(({ t, u, src, at, pub: p, yeni, off }) => ({ t, u, src, at, pub: p, yeni, off }));
    return NextResponse.json({ ok: true, at: doc ? doc.at : 0, items }, { headers: { ...cors, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  }
  return NextResponse.json({ ok: true, ...(doc || { items: [], at: 0 }) }, { headers: { ...cors, "Cache-Control": "no-store" } });
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
