import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import {
  adminDb, dueNotes, env, hasAccess, pushReady, sendToUser, verifyUser,
  type BossMap, type Note, type PushDoc,
} from "@/lib/koekip-server";
import type { Firestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * KO Ekip bildirimleri
 *  POST /api/koekip/push/test   → kendi cihazlarına deneme bildirimi
 *  POST /api/koekip/push/team   → ekibe anlık bildirim: { type: "online" | "boss", team, name, boss?, server? }
 *  GET  /api/koekip/push/cron   → zamanlayıcı (dakikada bir): event ve boss hatırlatmaları
 *       Yetki: ?key=CRON_SECRET ya da "Authorization: Bearer CRON_SECRET"
 */
type Ctx = { params: Promise<{ action: string }> };
const json = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" } });
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

async function needUser(req: NextRequest) {
  const u = await verifyUser(req.headers.get("authorization"));
  if (!u) return { err: json(req, { error: "Giriş gerekli" }, 401) };
  if (!(await hasAccess(u))) return { err: json(req, { error: "Davet gerekli" }, 403) };
  const db = adminDb();
  if (!db) return { err: json(req, { error: "Sunucuda FIREBASE_SERVICE_ACCOUNT tanımlı değil" }, 503) };
  if (!pushReady()) return { err: json(req, { error: "Sunucuda VAPID anahtarları tanımlı değil" }, 503) };
  return { u, db };
}

/* ---------- deneme ---------- */
async function test(req: NextRequest) {
  const r = await needUser(req);
  if (r.err) return r.err;
  const s = await r.db.doc(`kohesapPush/${r.u.uid}`).get();
  const sent = s.exists ? await sendToUser(r.db, r.u.uid, s.data() as PushDoc, {
    title: "KO Ekip", body: "Bildirimler çalışıyor ✓ Event ve boss öncesi burada haber vereceğiz.", tag: "test", kind: "test",
  }) : 0;
  return json(req, { sent });
}

/* ---------- ekip: çevrimiçi / boss çıktı ---------- */
async function throttle(db: Firestore, key: string, ms: number): Promise<boolean> {
  const ref = db.doc(`kohesapPushState/${key}`);
  return db.runTransaction(async (t) => {
    const s = await t.get(ref);
    const last = s.exists ? Number(s.get("at")) || 0 : 0;
    if (Date.now() - last < ms) return false;
    t.set(ref, { at: Date.now() });
    return true;
  });
}
async function team(req: NextRequest) {
  const r = await needUser(req);
  if (r.err) return r.err;
  const { u, db } = r;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const type = body.type === "boss" ? "boss" : "online";
  const code = clean(body.team, 12).toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return json(req, { error: "Ekip kodu geçersiz" }, 400);
  const ts = await db.doc(`kohesapTeams/${code}`).get();
  const td = ts.data() as { name?: string; memberUids?: string[]; members?: Record<string, { name?: string; main?: string; chars?: { id: string; name: string }[] }> } | undefined;
  if (!td || !(td.memberUids || []).includes(u.uid)) return json(req, { error: "Bu ekibin üyesi değilsin" }, 403);
  const me = (td.members || {})[u.uid];
  const mainName = me && me.chars ? (me.chars.find((c) => c.id === me.main) || me.chars[0] || { name: "" }).name : "";
  const who = clean(body.name, 30) || clean(mainName, 30) || clean(me && me.name, 30) || "Bir üye";

  let note: Note, pref: "online" | "boss";
  if (type === "online") {
    if (!(await throttle(db, `on_${u.uid}`, 30 * 60e3))) return json(req, { sent: 0, skipped: "throttle" });
    note = { title: `🟢 ${who} çevrimiçi`, body: `${td.name || "Ekip"} · KO Ekip'e girdi`, tag: `online-${u.uid}`, kind: "online", url: "/?p=ses" };
    pref = "online";
  } else {
    const boss = clean(body.boss, 40), server = clean(body.server, 24);
    if (!boss) return json(req, { error: "Boss adı yok" }, 400);
    if (!(await throttle(db, `boss_${code}_${boss.replace(/[^A-Za-z0-9]/g, "")}`, 2 * 60e3))) return json(req, { sent: 0, skipped: "throttle" });
    note = { title: `🐉 ${boss} çıktı!`, body: `${server ? server + " · " : ""}${who} duyurdu`, tag: `bossup-${boss}`, kind: "boss", url: "/?p=boss" };
    pref = "boss";
  }
  const others = (td.memberUids || []).filter((x) => x !== u.uid);
  if (!others.length) return json(req, { sent: 0 });
  const docs = await db.getAll(...others.map((x) => db.doc(`kohesapPush/${x}`)));
  let sent = 0;
  await Promise.all(docs.map(async (d) => {
    if (!d.exists) return;
    const p = d.data() as PushDoc;
    if (p[pref] === false) return;
    sent += await sendToUser(db, d.id, p, note);
  }));
  return json(req, { sent });
}

/* ---------- zamanlayıcı ---------- */
let usersCache: { at: number; docs: { id: string; data: PushDoc }[] } | null = null;

async function cron(req: NextRequest) {
  const secret = env("CRON_SECRET");
  const given = req.nextUrl.searchParams.get("key") || (/^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "") || [])[1];
  if (!secret || (given || "").trim() !== secret) return json(req, { error: "yetkisiz" }, 401);
  const db = adminDb();
  if (!db) return json(req, { error: "FIREBASE_SERVICE_ACCOUNT yok" }, 503);
  if (!pushReady()) return json(req, { error: "VAPID yok" }, 503);

  const now = Date.now(), nowB = Math.floor(now / 60e3);
  // Bir önceki çalışmadan bu yana kaçırılan dakikalar (en fazla 10) da işlenir
  const stRef = db.doc("kohesapPushState/cron");
  const st = await stRef.get();
  const lastB = st.exists ? Number(st.get("b")) || nowB - 1 : nowB - 1;
  if (lastB >= nowB) return json(req, { ok: true, skipped: "aynı dakika" });
  const fromB = Math.max(lastB + 1, nowB - 10);
  await stRef.set({ b: nowB, at: now });
  await db.doc("kohesapAssets/pushCron").set({ at: now });

  if (!usersCache || now - usersCache.at > 2 * 60e3) {
    const qs = await db.collection("kohesapPush").get();
    usersCache = { at: now, docs: qs.docs.map((d) => ({ id: d.id, data: d.data() as PushDoc })) };
  }
  const bossDocs = new Map<string, BossMap>();
  let sent = 0, notes = 0;

  for (const { id, data: p } of usersCache.docs) {
    if (!p.subs || !Object.keys(p.subs).length) continue;
    let boss: BossMap = {};
    if (p.boss !== false && p.team && p.server && /^[A-Z0-9]{8}$/.test(p.team)) {
      const key = `${p.team}/${p.server}`;
      if (!bossDocs.has(key)) {
        const s = await db.doc(`kohesapTeams/${p.team}/boss/${p.server}`).get().catch(() => null);
        bossDocs.set(key, (s && s.exists && (s.get("b") as BossMap)) || {});
      }
      boss = bossDocs.get(key) || {};
    }
    const out = dueNotes(p, boss, now, fromB, nowB);
    for (const n of out.slice(0, 5)) { notes++; sent += await sendToUser(db, id, p, n); }
  }
  return json(req, { ok: true, users: usersCache.docs.length, notes, sent, minutes: nowB - fromB + 1 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  try {
    if (action === "test") return await test(req);
    if (action === "team") return await team(req);
    if (action === "cron") return await cron(req);
  } catch (e) {
    console.error("push", action, e);
    return json(req, { error: (e as Error).message }, 500);
  }
  return json(req, { error: "bilinmeyen işlem" }, 404);
}
export async function GET(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action !== "cron") return json(req, { error: "POST kullan" }, 405);
  try { return await cron(req); } catch (e) { console.error("cron", e); return json(req, { error: (e as Error).message }, 500); }
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
