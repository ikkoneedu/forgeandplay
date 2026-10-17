/** KC (Knight Cash) paket fiyatlarını sayfa metninden çıkarma */
/** "1.820,00" / "1,820.00" / "1820" → 1820 */
export function num(s: string): number {
  let t = s.trim();
  const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (lc > -1) t = /,\d{2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  else if (ld > -1 && /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  return Number(t);
}
const okRate = (r: number) => r > 0.15 && r < 3;
export const stripHtml = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");

/** Metinden (KC, TL) paket çiftleri */
export function pairs(text: string): { kc: number; tl: number }[] {
  const out: { kc: number; tl: number }[] = [];
  const add = (kc: number, tl: number) => { if (kc >= 100 && kc <= 50000 && okRate(tl / kc) && !out.some((x) => x.kc === kc)) out.push({ kc, tl }); };
  // "400 Cash … 227,50 TL" / "1600 Knight Online (KO) Cash … 910 ₺"
  const re1 = /(\d{1,2}[.,]\d{3}|\d{3,5})\s*(?:Knight\s*Online\s*)?(?:\(?KO\)?\s*)?(?:Cash|KC)\b[^₺]{0,200}?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:₺|TL)/gi;
  // tablo: "1.200 682,50"
  const re2 = /(?:^|\s)(\d{1,2}\.\d{3}|[1-9]\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text))) add(num(m[1]), num(m[2]));
  while ((m = re2.exec(text))) { const kc = num(m[1]); if (kc % 400 === 0) add(kc, num(m[2])); }
  return out;
}
export function pick(list: { kc: number; tl: number }[]) {
  if (!list.length) return null;
  const by400 = list.find((x) => x.kc === 400);
  if (by400) return by400;
  const s = [...list].sort((a, b) => a.tl / a.kc - b.tl / b.kc);
  const mid = s[Math.floor(s.length / 2)];
  return { kc: 400, tl: Math.round((mid.tl / mid.kc) * 400 * 100) / 100 };
}
