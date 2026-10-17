import { NextRequest, NextResponse } from "next/server";
import { KOHESAP_EXE_URL, KOHESAP_EXE_VERSION, corsHeaders } from "@/lib/kohesap";
import { vapidPublic } from "@/lib/koekip-server";

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
    push: {
      vapid: vapidPublic(),
      ready: !!(vapidPublic() && process.env.VAPID_PRIVATE_KEY),
      admin: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    },
    turn: !!((process.env.CF_TURN_KEY_ID && process.env.CF_TURN_API_TOKEN) || process.env.TURN_URLS),
  };
  return NextResponse.json(body, {
    headers: { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
