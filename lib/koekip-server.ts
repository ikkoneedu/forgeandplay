/**
 * KO Ekip — sunucu tarafı yardımcılar (yalnızca API rotalarında kullanılır).
 *
 * Ortam değişkenleri (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT   Firebase hizmet hesabı JSON'u (düz metin ya da base64)
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   Web Push anahtarları
 *   CRON_SECRET                Zamanlayıcının (cron-job.org) çağırdığı gizli anahtar
 *   CF_TURN_KEY_ID / CF_TURN_API_TOKEN     Cloudflare TURN (sesli sohbet aktarma sunucusu)
 *   TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL  (isteğe bağlı) başka bir TURN sağlayıcısı
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import webpush from "web-push";

export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "carkci.caner@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function serviceAccount(): Record<string, string> | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    const txt = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(txt);
    if (j.private_key) j.private_key = String(j.private_key).replace(/\\n/g, "\n");
    return j;
  } catch {
    return null;
  }
}

let app: App | null = null;
let hasCred = false;
export function adminApp(): App {
  if (app) return app;
  const sa = serviceAccount();
  hasCred = !!sa;
  const projectId = (sa && sa.project_id) || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  app = getApps().find((a) => a.name === "koekip") ||
    initializeApp(sa ? { credential: cert(sa as never), projectId } : { projectId }, "koekip");
  return app;
}
/** Firestore yönetici erişimi (hizmet hesabı yoksa null). */
export function adminDb(): Firestore | null {
  adminApp();
  return hasCred ? getFirestore(adminApp()) : null;
}

/** "Authorization: Bearer <Firebase kimlik jetonu>" doğrular. */
export async function verifyUser(authHeader: string | null): Promise<DecodedIdToken | null> {
  const m = /^Bearer\s+(.+)$/i.exec(authHeader || "");
  if (!m) return null;
  try {
    return await getAuth(adminApp()).verifyIdToken(m[1]);
  } catch {
    return null;
  }
}
export const isAdminEmail = (email?: string | null) => !!email && ADMIN_EMAILS.includes(email.toLowerCase());

/** KO Ekip davetli mi? (admin ya da kohesapAccess kaydı var) */
export async function hasAccess(u: DecodedIdToken): Promise<boolean> {
  if (isAdminEmail(u.email)) return true;
  const db = adminDb();
  if (!db) return true; // hizmet hesabı yoksa yalnızca giriş kontrolü yapılabilir
  return (await db.doc(`kohesapAccess/${u.uid}`).get()).exists;
}

/* ---------------- Web Push ---------------- */
let vapidOk: boolean | null = null;
export function pushReady(): boolean {
  if (vapidOk !== null) return vapidOk;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidOk = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:carkci.caner@gmail.com", pub, priv);
  return (vapidOk = true);
}
export const vapidPublic = () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushDoc = {
  subs?: Record<string, PushSub & { at?: number; ua?: string }>;
  ev?: boolean; boss?: boolean; online?: boolean; lead?: number;
  team?: string; server?: string; name?: string;
  evs?: { n: string; d: number[]; t: string[]; u?: string }[];
  bossIds?: string[];
};
export type Note = { title: string; body: string; tag?: string; url?: string; kind?: string };

/** Bir kullanıcının tüm cihazlarına bildirim gönderir; geçersiz abonelikleri siler. */
export async function sendToUser(db: Firestore, uid: string, doc: PushDoc, note: Note): Promise<number> {
  if (!pushReady() || !doc.subs) return 0;
  let ok = 0;
  const dead: string[] = [];
  await Promise.all(Object.entries(doc.subs).map(async ([id, s]) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(note), { TTL: 600, urgency: "high" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(id);
    }
  }));
  if (dead.length) {
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.doc(`kohesapPush/${uid}`).update(Object.fromEntries(dead.map((id) => [`subs.${id}`, FieldValue.delete()]))).catch(() => {});
  }
  return ok;
}

/* ---------------- zaman (Türkiye, UTC+3 sabit) ---------------- */
export const TR_OFFSET = 3 * 3600e3;
/** Türkiye saatine göre gün (0=Pazar) ve "SS:DD" → o anın UTC zamanı (ms) */
export function trParts(ms: number) {
  const d = new Date(ms + TR_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), dow: d.getUTCDay() };
}
export function trAt(y: number, m: number, day: number, hhmm: string): number {
  const [h, mi] = hhmm.split(":").map(Number);
  return Date.UTC(y, m, day, h || 0, mi || 0) - TR_OFFSET;
}
export const trClock = (ms: number) => new Date(ms + TR_OFFSET).toISOString().slice(11, 16);

/* ---------------- zamanlayıcı hesabı (saf fonksiyon; test edilebilir) ---------------- */
export type BossMap = Record<string, { k?: number; iv?: number; n?: string }>;
/**
 * Bu dakikada (fromB..nowB dakika aralığı) gönderilmesi gereken bildirimler.
 * Bildirim anı = başlangıç − öne alma süresi (lead).
 */
export function dueNotes(p: PushDoc & { bossAll?: boolean }, boss: BossMap, now: number, fromB: number, nowB: number): Note[] {
  const lead = Math.min(60, Math.max(1, Number(p.lead) || 10)) * 60e3;
  const due = (fireAt: number) => { const b = Math.floor(fireAt / 60e3); return b >= fromB && b <= nowB; };
  const out: Note[] = [];
  if (Array.isArray(p.evs)) {
    for (const e of p.evs) {
      const isBoss = (e as { k?: string }).k === "boss";
      if (isBoss ? p.boss === false : p.ev === false) continue;
      for (let dd = -1; dd <= 1; dd++) {
        const base = trParts(now + dd * 864e5);
        if (!Array.isArray(e.d) || !e.d.includes(base.dow)) continue;
        const ymd = `${base.y}-${String(base.m + 1).padStart(2, "0")}-${String(base.day).padStart(2, "0")}`;
        if (e.u && ymd > e.u) continue;
        for (const t of e.t || []) {
          if (!/^\d{1,2}:\d{2}$/.test(t)) continue;
          const at = trAt(base.y, base.m, base.day, t);
          if (at > now && due(at - lead)) {
            const mins = Math.max(1, Math.round((at - now) / 60e3));
            out.push(isBoss
              ? { title: "🐉 Boss alarmı", body: `${String(e.n).replace(/^🐉\s*/, "")} ${mins} dk sonra (${t})`, tag: `b-${e.n}-${at}`, kind: "boss", url: "/?p=boss" }
              : { title: `⏰ ${e.n}`, body: `${mins} dk sonra başlıyor (${t})`, tag: `e-${e.n}-${at}`, kind: "event", url: "/?p=event" });
          }
        }
      }
    }
  }
  if (p.boss !== false) {
    const ids = p.bossAll === false && Array.isArray(p.bossIds) ? new Set(p.bossIds) : null;
    for (const [bid, r] of Object.entries(boss || {})) {
      if (!r || !r.k || !r.iv || (ids && !ids.has(bid))) continue;
      const at = r.k + r.iv * 1000;
      if (at > now && due(at - lead)) {
        const mins = Math.max(1, Math.round((at - now) / 60e3));
        out.push({ title: "🐉 Boss alarmı", body: `${r.n || bid} ${mins} dk sonra çıkıyor (~${trClock(at)} · ${p.server || ""})`, tag: `b-${bid}-${at}`, kind: "boss", url: "/?p=boss" });
      }
    }
  }
  return out;
}
