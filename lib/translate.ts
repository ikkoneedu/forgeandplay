/**
 * Client-side translation with graceful fallbacks:
 *  1. On-device browser Translator API (free, no key) when available.
 *  2. Server route /api/translate (Claude) when ANTHROPIC_API_KEY is set.
 *  3. Original text (no translation) as a last resort.
 */
const cache = new Map<string, string>();

export async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text || !from || from === to) return text;
  const key = `${from}|${to}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // 1. On-device Translator API (Chrome)
  try {
    const T = (globalThis as unknown as { Translator?: any }).Translator;
    if (T) {
      const avail = await T.availability({ sourceLanguage: from, targetLanguage: to });
      if (avail && avail !== "unavailable") {
        const tr = await T.create({ sourceLanguage: from, targetLanguage: to });
        const out = await tr.translate(text);
        if (out) {
          cache.set(key, out);
          return out;
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 2. Server (Claude) fallback
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, from, to }),
    });
    const data = await res.json();
    const out = (data?.translated as string) || text;
    cache.set(key, out);
    return out;
  } catch {
    return text;
  }
}

const BCP47: Record<string, string> = { tr: "tr-TR", en: "en-US", es: "es-ES", zh: "zh-CN" };

export function toBcp47(locale: string): string {
  return BCP47[locale] || locale;
}

export function speakText(text: string, locale: string): void {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = toBcp47(locale);
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
