/**
 * Firestore kurallarını repodaki firestore.rules ile otomatik eşitler.
 * Hizmet hesabı (FIREBASE_SERVICE_ACCOUNT) Firebase'deki yayınlı kuralı okur; repodakinden
 * farklıysa repodakini yayınlar. Böylece kural değişikliği Vercel yayınıyla birlikte gider,
 * Firebase Console'a elle yapıştırmak gerekmez.
 *
 * Yalnızca üretim yayınında çalışır (VERCEL_ENV=production): önizleme dalları canlı kuralları değiştirmesin.
 * Dosya Vercel'e next.config.ts → outputFileTracingIncludes ile taşınır.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import type { Firestore } from "firebase-admin/firestore";
import { getSecurityRules } from "firebase-admin/security-rules";
import { adminApp } from "@/lib/koekip-server";

export type RulesState = { ok: boolean; same?: boolean; released?: boolean; skipped?: string; error?: string; hash?: string; at?: number };

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();
const sha = (s: string) => createHash("sha256").update(norm(s)).digest("hex").slice(0, 16);

let local: { src: string; hash: string } | null = null;
export function localRules(): { src: string; hash: string } | null {
  if (local) return local;
  try {
    const src = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
    return (local = { src, hash: sha(src) });
  } catch {
    return null;
  }
}
export const rulesSyncEnabled = () => process.env.VERCEL_ENV === "production" || process.env.KOEKIP_RULES_SYNC === "1";

/**
 * Gerekirse yayınlar. force değilse önce kohesapPushState/rules belgesine bakar:
 * bu sürümün kuralı zaten eşitlendiyse Firebase'e hiç sormaz (zamanlayıcı her dakika çağırır).
 */
export async function syncRules(db: Firestore, force = false): Promise<RulesState> {
  if (!rulesSyncEnabled()) return { ok: true, skipped: "üretim dışı" };
  const l = localRules();
  if (!l) return { ok: false, error: "firestore.rules sunucuda bulunamadı" };
  const stRef = db.doc("kohesapPushState/rules");
  if (!force) {
    const st = await stRef.get();
    if (st.exists && st.get("hash") === l.hash && st.get("ok") === true) return { ok: true, same: true, hash: l.hash, skipped: "zaten eşit" };
    // hata sonrası her dakika denemesin: 10 dakikada bir
    if (st.exists && st.get("hash") === l.hash && Date.now() - (Number(st.get("at")) || 0) < 10 * 60e3) return { ok: false, hash: l.hash, error: String(st.get("error") || ""), skipped: "bekliyor" };
  }
  const rules = getSecurityRules(adminApp());
  let out: RulesState;
  try {
    const cur = await rules.getFirestoreRuleset().catch(() => null);
    const curSrc = cur && cur.source && cur.source[0] ? cur.source[0].content : "";
    if (curSrc && sha(curSrc) === l.hash) out = { ok: true, same: true, hash: l.hash };
    else { await rules.releaseFirestoreRulesetFromSource(l.src); out = { ok: true, released: true, hash: l.hash }; }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    out = { ok: false, hash: l.hash, error: /permission|403|PERMISSION_DENIED/i.test(msg)
      ? "Hizmet hesabının kural yayınlama izni yok (Google Cloud IAM → hizmet hesabına \"Firebase Rules Admin\" rolü ekle). " + msg.slice(0, 200)
      : msg.slice(0, 300) };
  }
  out.at = Date.now();
  await stRef.set({ hash: l.hash, ok: out.ok, released: !!out.released, error: out.error || "", at: out.at }).catch(() => {});
  if (out.released) console.log("firestore.rules yayınlandı", l.hash);
  return out;
}
