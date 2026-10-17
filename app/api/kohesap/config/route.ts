import { NextRequest, NextResponse } from "next/server";
import { KOHESAP_EXE_URL, KOHESAP_EXE_VERSION, corsHeaders } from "@/lib/kohesap";
import { env, vapidPublic } from "@/lib/koekip-server";

export const dynamic = "force-dynamic";

/**
 * KO Hesap istemci yapılandırması (web + Windows uygulaması).
 * Firebase web yapılandırması zaten herkese açık (NEXT_PUBLIC_*) değerlerdir;
 * exe bunları buradan alır ve aynı Google hesabıyla senkron çalışır.
 */
export async function GET(req: NextRequest) {
  const body = {
    firebase: {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    },
    exeVersion: KOHESAP_EXE_VERSION,
    exeUrl: KOHESAP_EXE_URL,
    // asıl alan adı (forgeandplay.com ↔ www yönlendirmesinden sonra); exe API çağrılarını buraya yapar
    site: `https://${req.headers.get("x-forwarded-host") || req.headers.get("host") || "forgeandplay.com"}`,
    push: {
      vapid: vapidPublic(),
      ready: !!(vapidPublic() && env("VAPID_PRIVATE_KEY")),
      admin: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    },
    turn: !!((env("CF_TURN_KEY_ID") && env("CF_TURN_API_TOKEN")) || env("TURN_URLS")),
  };
  return NextResponse.json(body, {
    headers: { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
