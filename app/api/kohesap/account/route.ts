import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { corsHeaders } from "@/lib/kohesap";
import { adminApp, adminDb, isAdmin, verifyUser } from "@/lib/koekip-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Hesabımı sil (KVKK m.7 / m.11): kullanıcının tüm KO Ekip verisini ve Google ile açılan
 * Firebase hesabını kalıcı olarak siler. Ekiplerden çıkarılır; liderse liderlik sıradaki
 * üyeye geçer, tek kişiyse ekip silinir. Admin hesabı buradan silinemez.
 *   DELETE /api/kohesap/account   (Authorization: Bearer <kimlik jetonu>)
 */
export async function DELETE(req: NextRequest) {
  const cors = { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" };
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u) return NextResponse.json({ ok: false, error: "Giriş gerekli" }, { status: 401, headers: cors });
  if (isAdmin(u)) return NextResponse.json({ ok: false, error: "Yönetici hesabı buradan silinemez" }, { status: 403, headers: cors });
  // son 10 dakika içinde giriş yapılmış olmalı (çalınmış oturumla silinmesin)
  if (!u.auth_time || Date.now() / 1000 - u.auth_time > 600)
    return NextResponse.json({ ok: false, error: "Güvenlik için çıkış yapıp tekrar giriş yap, sonra yeniden dene", relogin: true }, { status: 401, headers: cors });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Sunucuda FIREBASE_SERVICE_ACCOUNT tanımlı değil" }, { status: 503, headers: cors });
  const uid = u.uid;
  try {
    // ekipler
    const teams = await db.collection("kohesapTeams").where("memberUids", "array-contains", uid).get();
    for (const t of teams.docs) {
      const ids = ((t.get("memberUids") as string[]) || []).filter((x) => x !== uid);
      if (!ids.length) { await db.recursiveDelete(t.ref); continue; }
      await t.ref.update({
        memberUids: ids, [`members.${uid}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
        ...(t.get("owner") === uid ? { owner: ids[0] } : {}),
      });
      await t.ref.collection("voice").doc(uid).delete().catch(() => {});
    }
    await db.recursiveDelete(db.doc(`kohesap/${uid}`));
    await Promise.all([`kohesapPush/${uid}`, `kohesapRequests/${uid}`, `kohesapAccess/${uid}`].map((p) => db.doc(p).delete().catch(() => {})));
    await getAuth(adminApp()).deleteUser(uid).catch((e) => { if ((e as { code?: string }).code !== "auth/user-not-found") throw e; });
    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (e) {
    console.error("hesap silme", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: cors });
  }
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: { ...corsHeaders(req.headers.get("origin")), "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" } });
}
