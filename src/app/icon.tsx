import { ImageResponse } from "next/og";

export const size = { width: 128, height: 128 };
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
          background: "#141210",
          borderRadius: "24px",
        }}
      >
        <span
          style={{
            fontSize: "72px",
            fontWeight: 700,
            fontFamily: "sans-serif",
            color: "#d4743c",
          }}
        >
          G
        </span>
      </div>
    ),
    { ...size }
  );
}
