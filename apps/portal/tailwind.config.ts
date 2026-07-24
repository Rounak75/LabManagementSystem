import type { Config } from "tailwindcss";

const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        ambient: "0 8px 30px rgba(0, 0, 0, 0.04)",
        "inner-bezel": "inset 0 1px 1px rgba(255, 255, 255, 0.15)",
        "inner-bezel-dark": "inset 0 1px 1px rgba(0, 0, 0, 0.05)"
      },
      transitionTimingFunction: {
        "out-fluid": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      colors: {
        bg: withAlpha("--bg"),
        elev: withAlpha("--elev"),
        surface: withAlpha("--surface"),
        line: withAlpha("--line"),
        text: withAlpha("--text"),
        muted: withAlpha("--muted"),
        soft: withAlpha("--soft"),
        ink: withAlpha("--ink"),
        brand: {
          DEFAULT: withAlpha("--brand"),
          soft: withAlpha("--brand-soft"),
          fg: withAlpha("--brand-fg"),
        },
        ok: {
          DEFAULT: withAlpha("--ok"),
          soft: withAlpha("--ok-soft"),
        },
        notice: {
          DEFAULT: withAlpha("--notice"),
          soft: withAlpha("--notice-soft"),
        },
      },
      borderRadius: {
        lg: "10px",
        xl: "14px",
      },
      letterSpacing: {
        snug: "-0.012em",
        tighter: "-0.022em",
      },
    },
  },
  plugins: [],
};
export default config;
