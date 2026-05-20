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
