/**
 * Firebase Authentication "Authorized domains" listesini otomatik tamamlar.
 * Google ile giriş yalnızca bu listedeki alan adlarında açılır; site yeni bir alan adına
 * taşınınca Firebase Console'a elle eklemek gerekmesin diye zamanlayıcı (cron) eksikleri ekler.
 * Var olan alan adlarına dokunmaz, yalnızca ekler.
 *
 * Hizmet hesabı (FIREBASE_SERVICE_ACCOUNT) Identity Toolkit yönetim API'sini kullanır
 * (Firebase Admin SDK hizmet hesabının yetkisi yeterlidir; değilse "Firebase Authentication Admin" rolü).
 * Yalnızca üretimde çalışır (rules-sync ile aynı koşul).
 */
import type { Firestore } from "firebase-admin/firestore";
import { adminApp } from "@/lib/koekip-server";
import { rulesSyncEnabled } from "@/lib/rules-sync";

/** girişin açık olması gereken alan adları */
export const AUTH_DOMAINS = ["koekip.app", "www.koekip.app"];

export type AuthDomainsState = { ok: boolean; added?: string[]; skipped?: string; error?: string; at?: number };
export type AuthDomainsApi = { get: () => Promise<string[]>; set: (list: string[]) => Promise<void> };

function identityApi(): AuthDomainsApi {
  const app = adminApp();
  const projectId = app.options.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const cred = app.options.credential;
  if (!projectId || !cred) throw new Error("Hizmet hesabı ya da proje kimliği yok");
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  const call = async (method: "GET" | "PATCH", body?: unknown) => {
    const { access_token } = await cred.getAccessToken();
    const r = await fetch(method === "PATCH" ? url + "?updateMask=authorizedDomains" : url, {
      method,
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${(j as { error?: { message?: string } }).error?.message || ""}`.trim());
    return j as { authorizedDomains?: string[] };
  };
  return {
    get: async () => (await call("GET")).authorizedDomains || [],
    set: async (list) => { await call("PATCH", { authorizedDomains: list }); },
  };
}

/** Eksik alan adlarını ekler. force değilse aynı liste daha önce tamamlandıysa API'ye hiç sormaz. */
export async function syncAuthDomains(db: Firestore, force = false, api?: AuthDomainsApi): Promise<AuthDomainsState> {
  if (!rulesSyncEnabled()) return { ok: true, skipped: "üretim dışı" };
  const key = AUTH_DOMAINS.join(",");
  const stRef = db.doc("kohesapPushState/authDomains");
  if (!force) {
    const st = await stRef.get();
    if (st.exists && st.get("key") === key && st.get("ok") === true) return { ok: true, skipped: "zaten tamam" };
    // hata sonrası her dakika denemesin: saatte bir
    if (st.exists && st.get("key") === key && Date.now() - (Number(st.get("at")) || 0) < 60 * 60e3) return { ok: false, error: String(st.get("error") || ""), skipped: "bekliyor" };
  }
  let out: AuthDomainsState;
  try {
    const a = api || identityApi();
    const cur = await a.get();
    const have = new Set(cur.map((d) => d.toLowerCase()));
    const add = AUTH_DOMAINS.filter((d) => !have.has(d));
    if (add.length) await a.set([...cur, ...add]);
    out = { ok: true, added: add };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    out = { ok: false, error: /permission|403|PERMISSION_DENIED/i.test(msg)
      ? "Hizmet hesabının Authentication ayarlarını değiştirme izni yok (Google Cloud IAM → \"Firebase Authentication Admin\" rolü) ya da alan adını Firebase Console → Authentication → Settings → Authorized domains'e elle ekle. " + msg.slice(0, 200)
      : msg.slice(0, 300) };
  }
  out.at = Date.now();
  await stRef.set({ key, ok: out.ok, added: out.added || [], error: out.error || "", at: out.at }).catch(() => {});
  if (out.added && out.added.length) console.log("Firebase yetkili alan adları eklendi", out.added);
  return out;
}
