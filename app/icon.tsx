import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#ffa23d,#ff3d7f 55%,#7c3aed)",
          color: "#fff",
          fontSize: 40,
          fontWeight: 800,
        }}
      >
        F
      </div>
    ),
    { ...size }
  );
}
