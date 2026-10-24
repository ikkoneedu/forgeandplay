/**
 * Sunucu yardımcıları: bildirim zamanlaması (plan, boss penceresi) ve kural eşitleme.
 * Çalıştır: npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueNotes, planNotes, DISCORD_WEBHOOK_RE, type TeamPlan } from "../lib/koekip-server";
import { syncRules } from "../lib/rules-sync";

const NOW = Date.UTC(2026, 9, 24, 17, 0); // 20:00 Türkiye
const B = Math.floor(NOW / 60e3);

test("planNotes: geliyor / belki alır, gelmiyor / cevapsız / event kapalı almaz", () => {
  const plans: TeamPlan[] = [
    { id: "a", t: "CSW", at: NOW + 10 * 60e3, note: "Moradon", rsvp: { u1: { s: "y" }, u2: { s: "n" }, u3: { s: "m" } } },
    { id: "b", t: "Farm", at: NOW + 30 * 60e3, rsvp: { u1: { s: "y" } } },
    { id: "c", t: "Geçmiş", at: NOW - 60e3, rsvp: { u1: { s: "y" } } },
  ];
  assert.deepEqual(planNotes("u1", { lead: 10 }, plans, NOW, B, B).map((n) => n.tag), ["p-a"]);
  assert.deepEqual(planNotes("u3", { lead: 10 }, plans, NOW, B, B).map((n) => n.tag), ["p-a"]);
  assert.equal(planNotes("u2", { lead: 10 }, plans, NOW, B, B).length, 0);
  assert.equal(planNotes("u9", { lead: 10 }, plans, NOW, B, B).length, 0);
  assert.equal(planNotes("u1", { lead: 10, ev: false }, plans, NOW, B, B).length, 0);
  assert.deepEqual(planNotes("u1", { lead: 30 }, plans, NOW, B, B).map((n) => n.tag), ["p-b"]);
  // zamanlayıcı birkaç dakika kaçırdıysa yine gönderilir
  assert.deepEqual(planNotes("u1", { lead: 12 }, plans, NOW, B - 3, B).map((n) => n.tag), ["p-a"]);
  const n = planNotes("u1", { lead: 10 }, plans, NOW, B, B)[0];
  assert.equal(n.title, "📅 CSW");
  assert.equal(n.body, "10 dk sonra (20:10) · Moradon");
});

test("dueNotes: boss penceresi en erken uca göre, aşırı sapma yok sayılır", () => {
  const iv = 32000, k = NOW + 20 * 60e3 - iv * 1000; // tahmini çıkış 20 dk sonra
  const p = { boss: true, lead: 10, server: "Zero" };
  assert.equal(dueNotes(p, { talos: { k, iv, n: "Talos" } }, NOW, B, B).length, 0);
  const o = dueNotes(p, { talos: { k, iv, n: "Talos", dv: [-10, 3] } }, NOW, B, B);
  assert.equal(o.length, 1);
  assert.match(o[0].body, /çıkabilir \(\d\d:\d\d–\d\d:\d\d/);
  assert.equal(dueNotes(p, { talos: { k, iv, n: "Talos", dv: [-500] } }, NOW, B, B).length, 0);
  const old = dueNotes(p, { talos: { k: NOW + 10 * 60e3 - iv * 1000, iv, n: "Talos" } }, NOW, B, B);
  assert.equal(old.length, 1);
  assert.match(old[0].body, /~/);
  assert.equal(dueNotes({ ...p, boss: false }, { talos: { k, iv, n: "Talos", dv: [-10] } }, NOW, B, B).length, 0);
});

test("Discord webhook deseni yalnızca discord.com webhook adreslerini kabul eder", () => {
  const ok = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123";
  assert.ok(DISCORD_WEBHOOK_RE.test(ok));
  assert.ok(DISCORD_WEBHOOK_RE.test(ok.replace("discord.com", "canary.discord.com")));
  for (const bad of [
    ok.replace("https", "http"),
    ok.replace("discord.com", "discord.com.evil.io"),
    ok.replace("discord.com", "evil.com"),
    ok + "?wait=true",
    ok.replace("/api/webhooks/", "/api/webhooks/../"),
  ]) assert.ok(!DISCORD_WEBHOOK_RE.test(bad), bad);
});

/* ---------- kural eşitleme (sahte Firestore ve kural API'si) ---------- */
function fakeDb() {
  const store: Record<string, Record<string, unknown>> = {};
  return {
    store,
    doc: (p: string) => ({
      get: async () => ({ exists: !!store[p], get: (k: string) => store[p] && store[p][k] }),
      set: async (v: Record<string, unknown>) => { store[p] = v; },
    }),
  };
}
function fakeRules(remote: string | null, failRelease = false) {
  const calls: string[] = [];
  return {
    calls,
    api: {
      getFirestoreRuleset: async () => { calls.push("get"); if (remote === null) throw new Error("yok"); return { source: [{ name: "firestore.rules", content: remote }] } as never; },
      releaseFirestoreRulesetFromSource: async () => { calls.push("release"); if (failRelease) throw new Error("7 PERMISSION_DENIED: izin yok"); return {} as never; },
    },
  };
}

test("syncRules: üretim dışında hiçbir şey yapmaz", async () => {
  delete process.env.VERCEL_ENV; delete process.env.KOEKIP_RULES_SYNC;
  const r = fakeRules("x");
  const out = await syncRules(fakeDb() as never, false, r.api);
  assert.equal(out.skipped, "üretim dışı");
  assert.equal(r.calls.length, 0);
});

test("syncRules: aynıysa yayınlamaz, farklıysa yayınlar, durum belgesiyle tekrar sormaz", async () => {
  process.env.VERCEL_ENV = "production";
  const { readFileSync } = await import("fs");
  const src = readFileSync("firestore.rules", "utf8");
  const db = fakeDb();
  let r = fakeRules(src);
  let out = await syncRules(db as never, false, r.api);
  assert.ok(out.ok && out.same && !r.calls.includes("release"));
  r = fakeRules(src);
  out = await syncRules(db as never, false, r.api);
  assert.equal(out.skipped, "zaten eşit");
  assert.equal(r.calls.length, 0);
  const db2 = fakeDb();
  r = fakeRules("rules_version = '2'; eski");
  out = await syncRules(db2 as never, false, r.api);
  assert.ok(out.ok && out.released && r.calls.includes("release"));
  r = fakeRules(null);
  out = await syncRules(fakeDb() as never, false, r.api);
  assert.ok(out.released, "hiç kural yoksa yayınlar");
});

test("syncRules: izin hatası anlaşılır mesaj, 10 dk bekler, elle tetikleme beklemeyi atlar", async () => {
  process.env.VERCEL_ENV = "production";
  const db = fakeDb();
  let r = fakeRules("eski", true);
  let out = await syncRules(db as never, false, r.api);
  assert.ok(!out.ok);
  assert.match(out.error || "", /Firebase Rules Admin/);
  r = fakeRules("eski");
  out = await syncRules(db as never, false, r.api);
  assert.equal(out.skipped, "bekliyor");
  assert.equal(r.calls.length, 0);
  out = await syncRules(db as never, true, r.api);
  assert.ok(out.ok && out.released);
  delete process.env.VERCEL_ENV;
});

/* ---------- alan adı geçişi: forgeandplay.com → koekip.app ---------- */
test("middleware: eski alan adı ve www sayfaları koekip.app'e yönlenir; API, sw.js ve indirmeler yönlenmez", async () => {
  const { NextRequest } = await import("next/server");
  const { default: middleware } = await import("../middleware");
  const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/130";
  const run = (url: string) => middleware(new NextRequest(url, { headers: { host: new URL(url).host, "user-agent": ua } }));
  for (const [from, to] of [
    ["https://forgeandplay.com/", "https://koekip.app/"],
    ["https://www.forgeandplay.com/event-rehberi", "https://koekip.app/event-rehberi"],
    ["https://forgeandplay.com/app?p=planla", "https://koekip.app/app?p=planla"],
    ["https://www.koekip.app/gizlilik", "https://koekip.app/gizlilik"],
  ]) {
    const r = run(from);
    assert.equal(r.status, 308, from);
    assert.equal(r.headers.get("location"), to);
  }
  for (const u of ["https://forgeandplay.com/api/kohesap/config", "https://forgeandplay.com/sw.js", "https://forgeandplay.com/downloads/KOEkip.exe", "https://koekip.app/", "https://koekip.app/app"]) {
    assert.notEqual(run(u).status, 308, u);
  }
});

/* ---------- Firebase Auth yetkili alan adları ---------- */
test("syncAuthDomains: eksikleri ekler, var olanlara dokunmaz, tamamsa tekrar sormaz, hata saatte bir", async () => {
  const { syncAuthDomains, AUTH_DOMAINS } = await import("../lib/auth-domains");
  delete process.env.VERCEL_ENV; delete process.env.KOEKIP_RULES_SYNC;
  assert.equal((await syncAuthDomains(fakeDb() as never)).skipped, "üretim dışı");
  process.env.VERCEL_ENV = "production";
  let list = ["localhost", "proj.firebaseapp.com", "forgeandplay.com"], gets = 0;
  const api = { get: async () => { gets++; return list.slice(); }, set: async (l: string[]) => { list = l; } };
  const db = fakeDb();
  let out = await syncAuthDomains(db as never, false, api);
  assert.ok(out.ok);
  assert.deepEqual(out.added, AUTH_DOMAINS);
  assert.deepEqual(list, ["localhost", "proj.firebaseapp.com", "forgeandplay.com", ...AUTH_DOMAINS]);
  out = await syncAuthDomains(db as never, false, api);
  assert.equal(out.skipped, "zaten tamam");
  assert.equal(gets, 1);
  out = await syncAuthDomains(db as never, true, api);
  assert.deepEqual(out.added, []);
  const db2 = fakeDb();
  const bad = { get: async () => { throw new Error("403 PERMISSION_DENIED"); }, set: async () => {} };
  out = await syncAuthDomains(db2 as never, false, bad);
  assert.ok(!out.ok && /Authorized domains/.test(out.error || ""));
  assert.equal((await syncAuthDomains(db2 as never, false, api)).skipped, "bekliyor");
  delete process.env.VERCEL_ENV;
});
