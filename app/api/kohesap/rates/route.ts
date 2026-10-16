import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Döviz kurları (TRY karşılığı) — 1 saat önbellekli. */
export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) });
    const d = (await res.json()) as { time_last_update_utc?: string; rates?: Record<string, number> };
    const r = d.rates ?? {};
    if (!r.TRY) throw new Error("kur verisi yok");
    return NextResponse.json(
      { ok: true, time: d.time_last_update_utc, USD: r.TRY, EUR: r.TRY / r.EUR, GBP: r.TRY / r.GBP },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Kur alınamadı" }, { status: 502 });
  }
}
