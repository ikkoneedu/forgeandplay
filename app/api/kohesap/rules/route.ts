import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import { adminDb, isAdmin, verifyUser } from "@/lib/koekip-server";
import { localRules, rulesSyncEnabled, syncRules } from "@/lib/rules-sync";
import { AUTH_DOMAINS, syncAuthDomains } from "@/lib/auth-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Firestore kuralları (yalnızca admin):
 *   GET  /api/kohesap/rules  → son eşitleme durumu
 *   POST /api/kohesap/rules  → repodaki firestore.rules'u şimdi yayınla (zamanlayıcıyı beklemeden)
 *                              ve Firebase Auth yetkili alan adlarını tamamla (AUTH_DOMAINS)
 */
async function gate(req: NextRequest) {
  const cors = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u || !isAdmin(u)) return { cors, err: NextResponse.json({ ok: false, error: "Yalnızca yönetici" }, { status: 403, headers: cors }) };
  const db = adminDb();
  if (!db) return { cors, err: NextResponse.json({ ok: false, error: "Sunucuda FIREBASE_SERVICE_ACCOUNT tanımlı değil" }, { status: 503, headers: cors }) };
  return { cors, db };
}
export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const [st, ad] = await Promise.all([g.db.doc("kohesapPushState/rules").get(), g.db.doc("kohesapPushState/authDomains").get()]);
  return NextResponse.json({ ok: true, enabled: rulesSyncEnabled(), local: localRules()?.hash || null, last: st.exists ? st.data() : null,
    authDomains: { want: AUTH_DOMAINS, last: ad.exists ? ad.data() : null } }, { headers: g.cors });
}
export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const [r, authDomains] = await Promise.all([syncRules(g.db, true), syncAuthDomains(g.db, true)]);
  return NextResponse.json({ ...r, authDomains }, { status: r.ok ? 200 : 500, headers: g.cors });
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
