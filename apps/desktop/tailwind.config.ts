import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { 
        brand: { DEFAULT: "#0e6ba8", dark: "#094471", light: "#e8f4fd" }, 
        danger: { DEFAULT: "#dc2626", light: "#fef2f2" },
        sidebar: { DEFAULT: "#111827", light: "#1f2937", border: "#1f2937" },
        surface: { DEFAULT: "#ffffff", page: "#f8fafc", muted: "#f1f5f9" },
        // Each pair clears WCAG 2.2 AA (4.5:1) both as text on white and as
        // text on its own wash. The previous -600 values sat at 3.1-4.4:1 on
        // the washes, so a status badge was the least legible thing on screen.
        status: {
          success: "#15803d",
          "success-light": "#f0fdf4",
          processing: "#1d4ed8",
          "processing-light": "#eff6ff",
          pending: "#b45309",
          "pending-light": "#fffbeb",
          error: "#b91c1c",
          "error-light": "#fef2f2",
        }
      },
      fontFamily: { 
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["'Geist'", "Inter", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "monospace"]
      },
      borderRadius: {
        card: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.08)",
        ambient: "0 8px 30px rgba(0,0,0,0.04)",
        // Dialogs and popovers sitting above the scrim. Tinted with slate-900
        // rather than pure black so overlay depth stays in the cool palette.
        overlay: "0 24px 60px -12px rgba(15,23,42,0.25)",
      },
      transitionTimingFunction: {
        "out-fluid": "cubic-bezier(0.23, 1, 0.32, 1)",
      }
    }
  },
  plugins: []
} satisfies Config;
