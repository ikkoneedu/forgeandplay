import { NextResponse } from "next/server";

/** Eski Forge&Play özelliği: kapatıldı (kötüye kullanım ve maliyet riski). */
const gone = () => NextResponse.json({ error: "Bu özellik kapatıldı." }, { status: 410, headers: { "Cache-Control": "no-store" } });
export const GET = gone;
export const POST = gone;
