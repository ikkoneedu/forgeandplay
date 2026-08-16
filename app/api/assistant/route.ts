import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * AI Game Assistant endpoint.
 * - With ANTHROPIC_API_KEY set → real Claude replies.
 * - Without it → returns { demo: true } so the client shows a canned reply.
 */
export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  let body: { messages?: { role: string; content: string }[]; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: null, demo: true });
  }

  const messages = (body.messages ?? []).slice(-12);
  const locale = body.locale ?? "tr";

  if (!key) {
    return NextResponse.json({ reply: null, demo: true });
  }

  const system =
    "You are Forge&Play's in-app gaming assistant. Help players choose games to play " +
    "and find teammates (LFG) for CS2, Valorant, League of Legends, Fortnite, Rocket League, " +
    "Apex Legends, EA FC 25 and PUBG. Keep answers short (1-3 sentences), friendly and practical. " +
    "When relevant, suggest visiting /lfg to find a team or /oyunlar to play instantly. " +
    `Always reply in the user's language (locale: ${locale}).`;

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
        max_tokens: 400,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ reply: null, demo: true });
    }
    const data = await res.json();
    const reply: string | null = data?.content?.[0]?.text ?? null;
    return NextResponse.json({ reply, demo: reply === null });
  } catch {
    return NextResponse.json({ reply: null, demo: true });
  }
}
