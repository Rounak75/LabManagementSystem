import type { Config } from "tailwindcss";

const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Theme-owned — the values live with the colour tokens in globals.css
        // because a shadow has to be darker than the surface it falls on, and
        // night mode's canvas is darker than day mode's shadow tint.
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
        // Black, not slate. Night mode's canvas is darker than the band, so a
        // slate-tinted shadow was *lighter* than what it fell on and rendered
        // as a halo under every header. Black is darker than both themes.
        band: "0 16px 34px -22px rgb(0 0 0 / 0.5)",
        bezel: "inset 0 1px 0 rgb(255 255 255 / 0.22)",
      },
      transitionTimingFunction: {
        "out-fluid": "cubic-bezier(0.23, 1, 0.32, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      colors: {
        bg: withAlpha("--bg"),
        elev: withAlpha("--elev"),
        "elev-pop": withAlpha("--elev-pop"),
        "pop-hover": withAlpha("--pop-hover"),
        surface: withAlpha("--surface"),
        line: withAlpha("--line"),
        "line-pop": withAlpha("--line-pop"),
        text: withAlpha("--text"),
        muted: withAlpha("--muted"),
        soft: withAlpha("--soft"),
        ink: withAlpha("--ink"),
        band: withAlpha("--band-fg"),
        brand: {
          DEFAULT: withAlpha("--brand"),
          deep: withAlpha("--brand-deep"),
          hover: withAlpha("--brand-hover"),
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
        alert: {
          DEFAULT: withAlpha("--alert"),
          soft: withAlpha("--alert-soft"),
        },
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "26px",
        band: "32px",
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
