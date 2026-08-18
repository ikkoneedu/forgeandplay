import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const NAME: Record<string, string> = { tr: "Turkish", en: "English", es: "Spanish", zh: "Chinese" };

export async function POST(req: NextRequest) {
  let body: { text?: string; from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ translated: "" });
  }
  const text = (body.text || "").slice(0, 2000);
  const from = body.from || "";
  const to = body.to || "";
  const key = process.env.ANTHROPIC_API_KEY;

  if (!text || from === to || !key) {
    return NextResponse.json({ translated: text, untranslated: !key });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 500,
        system:
          `You are a real-time chat translator. Translate the user's message from ${NAME[from] || from} ` +
          `to ${NAME[to] || to}. Reply with ONLY the translation — no quotes, no explanations, keep it casual/gaming tone.`,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) return NextResponse.json({ translated: text });
    const data = await res.json();
    const translated = data?.content?.[0]?.text?.trim() || text;
    return NextResponse.json({ translated });
  } catch {
    return NextResponse.json({ translated: text });
  }
}
