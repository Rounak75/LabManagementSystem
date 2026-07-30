"use client";

// This file replaces the root layout when it renders, so the global stylesheet
// and font variables are not guaranteed to be present. Everything here is
// inline and self-contained — the one screen that cannot afford to depend on
// the rest of the design system loading.

const palette = {
  bg: "#EDF1F4",
  card: "#FFFFFF",
  line: "#E2E9ED",
  text: "#12262F",
  muted: "#7D919B",
  brand: "#3A7788",
};

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: palette.bg,
          color: palette.text,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "32px",
            textAlign: "center",
            backgroundColor: palette.card,
            border: `1px solid ${palette.line}`,
            borderRadius: "26px",
            boxShadow: "0 10px 26px -14px rgba(16, 40, 50, 0.16)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            The page failed to load
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "13.5px",
              lineHeight: 1.6,
              color: palette.muted,
            }}
          >
            Please try again. If this keeps happening, contact the lab on{" "}
            <a href="tel:6202924306" style={{ color: palette.brand, fontWeight: 600 }}>
              6202924306
            </a>
            .
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "24px",
              width: "100%",
              padding: "14px 20px",
              fontSize: "14.5px",
              fontWeight: 600,
              color: "#FFFFFF",
              backgroundColor: palette.brand,
              border: "none",
              borderRadius: "20px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
