/**
 * Firestore güvenlik kuralları testleri (emülatörde).
 * Çalıştır: npm run test:rules   (Java 11+ gerekir; firebase-tools npx ile gelir)
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { readFileSync } from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-koekip', firestore: { rules: readFileSync(process.argv[2] || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
const tok = u => ({ email: u + '@x.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const db = u => env.authenticatedContext(u, tok(u)).firestore();
const T = 'kohesapTeams/ABCD2345';
await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore();
  for (const u of ['u1', 'u2', 'u3', 'u4']) await setDoc(doc(f, 'kohesapAccess/' + u), { email: u + '@x.com', at: 1 });
  await setDoc(doc(f, T), { name: 'Ekip', owner: 'u1', memberUids: ['u1', 'u2', 'u3'], members: {} });
});
const base = (by, extra = {}) => ({ t: 'CSW', ev: 'csw', at: Date.now() + 3600e3, note: 'not', by, bn: by, rsvp: { [by]: { s: 'y', c: 'c1', cn: 'Ad', cls: 'priest', lv: 80, at: 1 } }, cAt: 1, ...extra });
let fails = 0;
const t = async (name, p) => { try { await p; console.log('PASS', name); } catch (e) { fails++; console.log('FAIL', name, e.message.slice(0, 150)); } };
const P = u => doc(db(u), T + '/plans/p1');
await t('üye plan açar', assertSucceeds(setDoc(P('u3'), base('u3'))));
await t('başkası adına açamaz', assertFails(setDoc(doc(db('u2'), T + '/plans/p2'), base('u3'))));
await t('başkasının cevabıyla açamaz', assertFails(setDoc(doc(db('u2'), T + '/plans/p3'), base('u2', { rsvp: { u2: { s: 'y' }, u1: { s: 'y' } } }))));
await t('bilinmeyen alanla açamaz', assertFails(setDoc(doc(db('u2'), T + '/plans/p4'), base('u2', { x: 1 }))));
await t('uzun başlık reddedilir', assertFails(setDoc(doc(db('u2'), T + '/plans/p5'), base('u2', { t: 'x'.repeat(61) }))));
await t('üye olmayan okuyamaz', assertFails(getDoc(P('u4'))));
await t('üye olmayan cevap veremez', assertFails(setDoc(P('u4'), { rsvp: { u4: { s: 'y' } } }, { merge: true })));
await t('üye okur', assertSucceeds(getDoc(P('u2'))));
await t('üye kendi cevabını yazar', assertSucceeds(setDoc(P('u2'), { rsvp: { u2: { s: 'm', c: 'c2', cn: 'B', cls: 'rogue', lv: 70, at: 2 } } }, { merge: true })));
await t('geçersiz cevap reddedilir', assertFails(setDoc(P('u2'), { rsvp: { u2: { s: 'x' } } }, { merge: true })));
await t('başkasının cevabını yazamaz', assertFails(setDoc(P('u2'), { rsvp: { u1: { s: 'n' } } }, { merge: true })));
await t('cevap + başlık birlikte değişmez', assertFails(setDoc(P('u2'), { t: 'Hack', rsvp: { u2: { s: 'y' } } }, { merge: true })));
await t('sıradan üye başlığı değiştiremez', assertFails(updateDoc(P('u2'), { t: 'Yeni' })));
await t('açan başlığı değiştirir', assertSucceeds(updateDoc(P('u3'), { t: 'CSW 2' })));
await t('lider başlığı değiştirir', assertSucceeds(updateDoc(P('u1'), { at: Date.now() + 7200e3 })));
await t('açan başkasının cevabını değiştiremez', assertFails(updateDoc(P('u3'), { 'rsvp.u2': { s: 'n' } })));
await t('açan "by" alanını değiştiremez', assertFails(updateDoc(P('u3'), { by: 'u2' })));
await t('üye cevabını geri alır', assertSucceeds(setDoc(P('u2'), { rsvp: { u2: deleteField() } }, { merge: true })));
await t('üye yoklama yazamaz', assertFails(setDoc(P('u2'), { att: { u2: 1 } }, { merge: true })));
await t('açan yoklama yazar', assertSucceeds(setDoc(P('u3'), { att: { u2: 1, u3: 1 } }, { mergeFields: ['att'] })));
await t('lider drop listesi yazar', assertSucceeds(setDoc(P('u1'), { loot: [{ i: 'Item', w: 'u2', wn: 'B', m: 'zar', r: { u2: 90 }, at: 1 }] }, { mergeFields: ['loot'] })));
await t('üye drop listesi yazamaz', assertFails(setDoc(P('u2'), { loot: [] }, { mergeFields: ['loot'] })));
await t('41 dropluk liste reddedilir', assertFails(setDoc(P('u1'), { loot: Array.from({ length: 41 }, () => ({ i: 'x' })) }, { mergeFields: ['loot'] })));
await t('yoklama sonrası üye cevabı hâlâ yazılır', assertSucceeds(setDoc(P('u2'), { rsvp: { u2: { s: 'y' } } }, { merge: true })));
await t('sıradan üye silemez', assertFails(deleteDoc(P('u2'))));
await t('lider siler', assertSucceeds(deleteDoc(P('u1'))));
// ---- ekip bul ilanları ----
const L = (u, o = {}) => ({ k: 'ekip', srv: 'Zero', nat: 'karus', cls: ['priest'], lv: 80, ws: 'Akşam', note: '', contact: 'nick', n: u, cn: 'C', tn: '', code: '', cnt: 0, at: Date.now(), exp: Date.now() + 7 * 864e5, ...o });
await t('kendi ilanını yazar', assertSucceeds(setDoc(doc(db('u4'), 'kohesapLfg/u4'), L('u4'))));
await t('başkası adına ilan yazamaz', assertFails(setDoc(doc(db('u2'), 'kohesapLfg/u4'), L('u2'))));
await t('onaylı herkes ilanları okur', assertSucceeds(getDoc(doc(db('u2'), 'kohesapLfg/u4'))));
await t('9 günlük ilan reddedilir', assertFails(setDoc(doc(db('u4'), 'kohesapLfg/u4'), L('u4', { exp: Date.now() + 9 * 864e5 }))));
await t('seviye 84 reddedilir', assertFails(setDoc(doc(db('u4'), 'kohesapLfg/u4'), L('u4', { lv: 84 }))));
await t('lider kendi ekip kodunu yayınlar', assertSucceeds(setDoc(doc(db('u1'), 'kohesapLfg/u1'), L('u1', { k: 'uye', code: 'ABCD2345', tn: 'Ekip', cnt: 3 }))));
await t('lider olmayan ekip kodu yayınlayamaz', assertFails(setDoc(doc(db('u2'), 'kohesapLfg/u2'), L('u2', { k: 'uye', code: 'ABCD2345' }))));
await t('ekip arayan ilanında kod olamaz', assertFails(setDoc(doc(db('u1'), 'kohesapLfg/u1'), L('u1', { code: 'ABCD2345' }))));
await t('başkasının ilanını silemez', assertFails(deleteDoc(doc(db('u2'), 'kohesapLfg/u4'))));
await t('kendi ilanını siler', assertSucceeds(deleteDoc(doc(db('u4'), 'kohesapLfg/u4'))));
// ---- discord (gizli) ----
const W = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123';
const DC = u => doc(db(u), T + '/private/discord');
await t('lider webhook kaydeder', assertSucceeds(setDoc(DC('u1'), { url: W, plan: true, boss: true, at: 1, by: 'u1' })));
await t('lider okur', assertSucceeds(getDoc(DC('u1'))));
await t('üye webhook okuyamaz', assertFails(getDoc(DC('u2'))));
await t('üye webhook yazamaz', assertFails(setDoc(DC('u2'), { url: W, at: 1, by: 'u2' })));
await t('discord dışı adres reddedilir', assertFails(setDoc(DC('u1'), { url: 'https://evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', at: 1, by: 'u1' })));
await t('benzer alan adı reddedilir', assertFails(setDoc(DC('u1'), { url: 'https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', at: 1, by: 'u1' })));
// ---- basma topluluk oranları ----
await t('kendi basma sayılarını paylaşır', assertSucceeds(setDoc(doc(db('u2'), 'kohesapAnvil/u2'), { s: { 'bus|5': [10, 6] }, at: 1 })));
await t('başkası adına paylaşamaz', assertFails(setDoc(doc(db('u3'), 'kohesapAnvil/u2'), { s: {}, at: 1 })));
await t('fazladan alan reddedilir', assertFails(setDoc(doc(db('u2'), 'kohesapAnvil/u2'), { s: {}, at: 1, item: 'x' })));
await t('onaylı kullanıcı topluluğu okur', assertSucceeds(getDoc(doc(db('u3'), 'kohesapAnvil/u2'))));
await t('kendi paylaşımını siler', assertSucceeds(deleteDoc(doc(db('u2'), 'kohesapAnvil/u2'))));
await env.cleanup();
console.log(fails ? fails + ' test başarısız' : 'Tüm kural testleri geçti'); process.exit(fails ? 1 : 0);
