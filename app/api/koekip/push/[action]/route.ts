import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/kohesap";
import {
  adminDb, discordPost, dueNotes, env, hasAccess, planNotes, pushReady, sendToUser, trClock, verifyUser,
  type BossMap, type Note, type PushDoc, type TeamPlan,
} from "@/lib/koekip-server";
import type { Firestore } from "firebase-admin/firestore";
import { refreshNews } from "@/lib/ko-news";
import { syncRules } from "@/lib/rules-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * KO Ekip bildirimleri
 *  POST /api/koekip/push/test   → kendi cihazlarına deneme bildirimi
 *  POST /api/koekip/push/team   → ekibe anlık bildirim: { type: "online" | "boss" | "plan" | "discord", team, name, boss?, server?, title?, at? }
 *       plan / boss ekibin Discord kanalına da gider (lider bağladıysa); "discord" = bağlantı denemesi (yalnızca lider)
 *  GET  /api/koekip/push/cron   → zamanlayıcı (dakikada bir): event, boss ve ekip planı hatırlatmaları
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
  const type = body.type === "boss" ? "boss" : body.type === "plan" ? "plan" : body.type === "discord" ? "discord" : "online";
  const code = clean(body.team, 12).toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return json(req, { error: "Ekip kodu geçersiz" }, 400);
  const ts = await db.doc(`kohesapTeams/${code}`).get();
  const td = ts.data() as { name?: string; memberUids?: string[]; members?: Record<string, { name?: string; main?: string; chars?: { id: string; name: string }[] }> } | undefined;
  if (!td || !(td.memberUids || []).includes(u.uid)) return json(req, { error: "Bu ekibin üyesi değilsin" }, 403);
  const me = (td.members || {})[u.uid];
  const mainName = me && me.chars ? (me.chars.find((c) => c.id === me.main) || me.chars[0] || { name: "" }).name : "";
  const who = clean(body.name, 30) || clean(mainName, 30) || clean(me && me.name, 30) || "Bir üye";

  if (type === "discord") {
    if ((td as { owner?: string }).owner !== u.uid) return json(req, { error: "Yalnızca ekip lideri" }, 403);
    const ok = await discordPost(db, code, `✅ **${td.name || "Ekip"}** KO Ekip'e bağlandı. Ekip planları ve "boss çıktı" duyuruları bu kanala düşecek.`);
    return json(req, { ok }, ok ? 200 : 502);
  }
  let note: Note, pref: "online" | "boss" | "ev", discord = "";
  if (type === "online") {
    if (!(await throttle(db, `on_${u.uid}`, 30 * 60e3))) return json(req, { sent: 0, skipped: "throttle" });
    note = { title: `🟢 ${who} çevrimiçi`, body: `${td.name || "Ekip"} · KO Ekip'e girdi`, tag: `online-${u.uid}`, kind: "online", url: "/?p=ses" };
    pref = "online";
  } else if (type === "plan") {
    const title = clean(body.title, 60), at = Number(body.at) || 0;
    if (!title || !at) return json(req, { error: "Plan bilgisi eksik" }, 400);
    if (!(await throttle(db, `plan_${code}_${u.uid}`, 60e3))) return json(req, { sent: 0, skipped: "throttle" });
    const day = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][new Date(at + 3 * 3600e3).getUTCDay()];
    note = { title: `📅 Yeni plan: ${title}`, body: `${day} ${trClock(at)} · ${who} açtı · geliyor musun?`, tag: `plan-${code}-${at}`, kind: "plan", url: "/?p=planla" };
    pref = "ev";
    discord = `📅 **${title}** · ${day} ${trClock(at)} — ${who} planladı. Katılım: <https://koekip.app/app?p=planla>`;
  } else {
    const boss = clean(body.boss, 40), server = clean(body.server, 24);
    if (!boss) return json(req, { error: "Boss adı yok" }, 400);
    if (!(await throttle(db, `boss_${code}_${boss.replace(/[^A-Za-z0-9]/g, "")}`, 2 * 60e3))) return json(req, { sent: 0, skipped: "throttle" });
    note = { title: `🐉 ${boss} çıktı!`, body: `${server ? server + " · " : ""}${who} duyurdu`, tag: `bossup-${boss}`, kind: "boss", url: "/?p=boss" };
    pref = "boss";
    discord = `🐉 **${boss}** çıktı!${server ? ` (${server})` : ""} — ${who}`;
  }
  // ekibin Discord kanalı (bağlıysa); push'u beklemez
  const dc = discord ? discordPost(db, code, discord, pref === "boss" ? "boss" : "plan").catch(() => false) : Promise.resolve(false);
  const others = (td.memberUids || []).filter((x) => x !== u.uid);
  if (!others.length) return json(req, { sent: 0, discord: await dc });
  const docs = await db.getAll(...others.map((x) => db.doc(`kohesapPush/${x}`)));
  let sent = 0;
  await Promise.all(docs.map(async (d) => {
    if (!d.exists) return;
    const p = d.data() as PushDoc;
    if (p[pref] === false) return;
    sent += await sendToUser(db, d.id, p, note);
  }));
  return json(req, { sent, discord: await dc });
}

/* ---------- zamanlayıcı ---------- */
/** ekibin önümüzdeki bir saat içinde başlayacak planları (çalışma başına ekip başına bir okuma) */
async function teamPlans(db: Firestore, cache: Map<string, TeamPlan[]>, team: string, now: number): Promise<TeamPlan[]> {
  const hit = cache.get(team);
  if (hit) return hit;
  const qs = await db.collection(`kohesapTeams/${team}/plans`).where("at", ">", now).where("at", "<=", now + 61 * 60e3).get().catch(() => null);
  const list = qs ? qs.docs.map((d) => ({ ...(d.data() as Omit<TeamPlan, "id">), id: d.id })) : [];
  cache.set(team, list);
  return list;
}
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
  // yeni yayında firestore.rules değiştiyse Firebase'e yayınla (eşitse tek belge okuması)
  const rules = await syncRules(db).catch((e) => ({ ok: false, error: (e as Error).message }));
  if (!rules.ok) console.warn("kurallar", rules.error);

  if (!usersCache || now - usersCache.at > 2 * 60e3) {
    const qs = await db.collection("kohesapPush").get();
    usersCache = { at: now, docs: qs.docs.map((d) => ({ id: d.id, data: d.data() as PushDoc })) };
  }
  const bossDocs = new Map<string, BossMap>();
  const plansCache = new Map<string, TeamPlan[]>();
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
    if (p.team && /^[A-Z0-9]{8}$/.test(p.team)) out.push(...planNotes(id, p, await teamPlans(db, plansCache, p.team, now), now, fromB, nowB));
    for (const n of out.slice(0, 5)) { notes++; sent += await sendToUser(db, id, p, n); }
  }
  // yeni sunucu haberleri: 10 dakikada bir tara, yeni sunucuyla ilgili yeni haber varsa bildir
  let news = 0;
  const nst = await db.doc("kohesapPushState/news").get();
  if (!nst.exists || now - (Number(nst.get("at")) || 0) > 10 * 60e3) {
    await db.doc("kohesapPushState/news").set({ at: now }, { merge: true });
    try {
      const r = await refreshNews(db);
      const day = new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
      const sentToday = nst.exists && nst.get("day") === day ? Number(nst.get("n")) || 0 : 0;
      const hot = r.first ? [] : r.fresh.filter((x) => x.yeni && (!x.pub || now - x.pub < 2 * 864e5)).slice(0, Math.max(0, Math.min(2, 4 - sentToday)));
      for (const it of hot) {
        const note: Note = { title: it.off ? "📢 Resmî duyuru" : "📰 Yeni sunucu haberi", body: `${it.t} · ${it.src}`.slice(0, 180), tag: `news-${it.id}`, kind: "news", url: "/app?p=yeni" };
        for (const { id, data: p } of usersCache.docs) {
          if (!p.subs || !Object.keys(p.subs).length || p.ev === false) continue;
          sent += await sendToUser(db, id, p, note);
        }
        news++;
      }
      if (hot.length) await db.doc("kohesapPushState/news").set({ at: now, day, n: sentToday + hot.length }, { merge: true });
    } catch (e) { console.warn("haberler", e); }
  }
  return json(req, { ok: true, users: usersCache.docs.length, notes, sent, news, minutes: nowB - fromB + 1, rules: rules.ok ? "ok" : "hata" });
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
