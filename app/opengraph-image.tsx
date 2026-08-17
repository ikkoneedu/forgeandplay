import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Forge&Play";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "0 90px",
          background: "#05060d",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 30 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              background: "linear-gradient(135deg,#ffa23d,#ff3d7f,#7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 800,
            }}
          >
            F
          </div>
          <div style={{ fontSize: 42, fontWeight: 800 }}>Forge&Play</div>
        </div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 800, lineHeight: 1.1, maxWidth: 940 }}>
          AI ile mükemmel takımını bul.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#9aa5c7", marginTop: 22 }}>
          Oyun arkadaşı · Anında oyunlar · forgeandplay.com
        </div>
      </div>
    ),
    { ...size }
  );
}
