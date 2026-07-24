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
        status: {
          success: "#16a34a",
          "success-light": "#f0fdf4",
          processing: "#2563eb",
          "processing-light": "#eff6ff",
          pending: "#d97706",
          "pending-light": "#fffbeb",
          error: "#dc2626",
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
      },
      transitionTimingFunction: {
        "out-fluid": "cubic-bezier(0.23, 1, 0.32, 1)",
      }
    }
  },
  plugins: []
} satisfies Config;
