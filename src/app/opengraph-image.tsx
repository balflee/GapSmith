import { ImageResponse } from "next/og";

export const alt = "GapSmith — AI-Powered Startup Idea Discovery & Validation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #141210 0%, #1c1a16 50%, #2a2520 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "linear-gradient(90deg, #d4743c, #f0c050, #3db5a6)",
          }}
        />
        <span
          style={{
            fontSize: "80px",
            fontWeight: 700,
            color: "#d4743c",
            marginBottom: "8px",
          }}
        >
          G
        </span>
        <span
          style={{
            fontSize: "48px",
            fontWeight: 700,
            color: "#ede9e0",
            letterSpacing: "-1px",
          }}
        >
          GapSmith
        </span>
        <span
          style={{
            fontSize: "22px",
            color: "#a09888",
            marginTop: "16px",
            maxWidth: "700px",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          From Market Signal to Validated Startup Idea in 2 Hours
        </span>
      </div>
    ),
    { ...size }
  );
}
