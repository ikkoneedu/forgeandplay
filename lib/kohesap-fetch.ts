/**
 * KO Hesap — sunucu tarafında enucuzgb sayfalarını / iç adreslerini tarayıcı
 * gibi okuma. Sitenin "DDoS koruması" ara sayfasını (JS ile çerez yazıp
 * yönlendiren küçük sayfa) geçer, Set-Cookie çerezlerini saklar.
 */
import { hostAllowed } from "@/lib/kohesap";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const JS_COOKIE = /document\.cookie\s*=\s*["']([^=;"']+)=([^;"']*)/;
const JS_LOCATION = /location\.href\s*=\s*["']([^"']+)["']/;

/** Basit çerez kavanozu (tek sunucu örneği içinde kalıcı). */
const jar = new Map<string, string>();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function keepCookies(res: Response) {
  const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of list) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

export async function fetchPassing(
  start: URL,
  opts: { accept?: string; referer?: string; xhr?: boolean } = {}
): Promise<{ res: Response; body: string }> {
  let url = start;
  for (let hop = 0; hop < 3; hop++) {
    const headers: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    };
    if (opts.referer) headers.Referer = opts.referer;
    if (opts.xhr) {
      headers["Sec-Fetch-Site"] = "same-origin";
      headers["Sec-Fetch-Mode"] = "cors";
      headers["Sec-Fetch-Dest"] = "empty";
    }
    const ck = cookieHeader();
    if (ck) headers.Cookie = ck;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000), cache: "no-store", redirect: "follow" });
    keepCookies(res);
    const body = await res.text();
    const m = body.length < 6000 ? body.match(JS_COOKIE) : null;
    if (!m) return { res, body };
    jar.set(m[1].trim(), m[2].trim());
    const loc = body.match(JS_LOCATION);
    if (loc) {
      const next = new URL(loc[1], url);
      if (!hostAllowed(next.hostname)) return { res, body };
      // yönlendirme sayfa içindiyse (ör. ?d=1) API isteğinde orijinal adrese dön
      url = opts.xhr ? start : next;
    }
  }
  throw new Error("sitenin koruma sayfası geçilemedi");
}
