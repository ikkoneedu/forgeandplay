import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * forgeandplay.com artık doğrudan KO Ekip'i açar.
 *  - "/"                       → KO Ekip uygulaması (public/kohesap-app)
 *  - eski site sayfaları        → "/" (yalnızca yasal sayfalar kalır)
 */
const intl = createMiddleware(routing);
const KEEP = /^\/(tr|en|es|zh)\/(gizlilik|kullanim-sartlari|iletisim)\/?$/;

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/kohesap-app/index.html" + search, req.url));
  }
  if (KEEP.test(pathname)) return intl(req);
  // eski adresler (/tr, /tr/kohesap, /oyunlar …) ana sayfaya
  return NextResponse.redirect(new URL("/" + search, req.url), 308);
}

export const config = {
  // /api, /_next, /_vercel ve uzantılı dosyalar (görseller, js, exe) hariç
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
