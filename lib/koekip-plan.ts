/**
 * KO Ekip — üyelik planı (Üye / VIP) sunucu tarafı.
 * Uygulamadaki plan.js ve Firestore kurallarıyla aynı mantık:
 *   config/plan { on, signup, price, teamVip, features: { id: 'uye'|'vip'|'kapali' } }
 *   kohesapAccess/{uid}.vipUntil (ms)
 * Sistem kapalıyken (on=false) her özellik üyelere açıktır.
 */
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb, isAdmin, isGoogle, verifyUser } from "@/lib/koekip-server";

export type Tier = "uye" | "vip" | "kapali";
export type Plan = { on: boolean; signup: string; price: number; teamVip: boolean; features: Record<string, Tier>; note?: string };
/** varsayılan katmanlar (plan.js FEATS ile aynı) */
export const FEATURE_DEFAULTS: Record<string, Tier> = {
  ekip: "uye", ekipkur: "uye", ses: "uye", sesli: "vip", planla: "uye", gunluk: "uye", boss: "uye", event: "uye", yeni: "uye", bildirim: "uye",
  panel: "uye", kasa: "uye", ticaret: "uye", parti: "uye", grind: "uye", gb: "vip", pazar: "vip", ilan: "vip",
  pus: "uye", exp: "uye", basma: "uye", fiyat: "uye",
};
export const PLAN_DEFAULT: Plan = { on: false, signup: "onay", price: 125, teamVip: true, features: {} };

let cache: { at: number; plan: Plan } | null = null;
export async function getPlan(): Promise<Plan> {
  if (cache && Date.now() - cache.at < 30_000) return cache.plan;
  const db = adminDb();
  let plan = PLAN_DEFAULT;
  if (db) {
    try {
      const s = await db.doc("config/plan").get();
      const d = (s.data() || {}) as Partial<Plan>;
      plan = { ...PLAN_DEFAULT, ...d, features: { ...(d.features || {}) } };
    } catch (e) {
      console.warn("plan okunamadı", e);
    }
  }
  cache = { at: Date.now(), plan };
  return plan;
}
export function tierOf(plan: Plan, id: string): Tier {
  if (!plan.on) return id === "ekipkur" ? "kapali" : "uye";
  const t = plan.features[id] || FEATURE_DEFAULTS[id] || "uye";
  return t === "vip" || t === "kapali" ? t : "uye";
}

type Acc = { code?: string; vipUntil?: number } | undefined;
const accVip = (a: Acc) => !!a && (a.code === "admin" || Number(a.vipUntil || 0) > Date.now());

/** Ekip VIP'i: kullanıcının ekiplerinden birinin lideri VIP mi (ya da admin)? */
async function teamVip(uid: string): Promise<boolean> {
  const db = adminDb(); if (!db) return false;
  const teams = await db.collection("kohesapTeams").where("memberUids", "array-contains", uid).limit(3).get();
  for (const t of teams.docs) {
    const owner = t.get("owner");
    if (!owner) continue;
    const o = await db.doc(`kohesapAccess/${owner}`).get();
    if (accVip(o.data() as Acc)) return true;
  }
  return false;
}

/** Kullanıcı bu özelliği kullanabilir mi? (erişim kaydı zaten okunmuşsa verilebilir) */
export async function featureOk(u: DecodedIdToken, id: string, acc?: Acc): Promise<boolean> {
  if (isAdmin(u)) return true;
  const plan = await getPlan();
  const t = tierOf(plan, id);
  if (t === "uye") return true;
  if (t === "kapali") return false;
  const db = adminDb(); if (!db) return false;
  const a = acc ?? ((await db.doc(`kohesapAccess/${u.uid}`).get()).data() as Acc);
  if (accVip(a)) return true;
  if (id === "sesli" && plan.teamVip) return teamVip(u.uid).catch(() => false);
  return false;
}

/**
 * API kapısı: üye değilse 401/403; özellik VIP ise ve kullanıcı VIP değilse 402.
 * Geçerse null döner.
 */
export async function requireFeature(req: Request, id: string, headers: Record<string, string> = {}): Promise<Response | null> {
  const h = { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json" };
  const out = (status: number, error: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: false, error, ...extra }), { status, headers: h });
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u) return out(401, "Giriş gerekli");
  if (!isGoogle(u)) return out(403, "Onay gerekli");
  if (isAdmin(u)) return null;
  const db = adminDb();
  if (!db) return out(403, "Onay gerekli");
  const s = await db.doc(`kohesapAccess/${u.uid}`).get();
  if (!s.exists) return out(403, "Onay gerekli");
  if (await featureOk(u, id, s.data() as Acc)) return null;
  const plan = await getPlan();
  return tierOf(plan, id) === "kapali" ? out(403, "Bu özellik şu an kapalı", { feature: id }) : out(402, "Bu özellik VIP üyelere açık", { feature: id, vip: true });
}
