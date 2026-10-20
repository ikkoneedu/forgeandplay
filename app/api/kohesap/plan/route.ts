import { NextResponse } from "next/server";
import { FEATURE_DEFAULTS, getPlan, tierOf } from "@/lib/koekip-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Herkese açık plan özeti (tanıtım sayfası: fiyat ve hangi özellik Üye / VIP). Gizli bilgi içermez. */
export async function GET() {
  const p = await getPlan();
  const features = Object.fromEntries(Object.keys(FEATURE_DEFAULTS).map((id) => [id, p.on ? tierOf(p, id) : (p.features[id] || FEATURE_DEFAULTS[id])]));
  return NextResponse.json(
    { ok: true, on: p.on, price: p.price, signup: p.signup, teamVip: p.teamVip, features },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
