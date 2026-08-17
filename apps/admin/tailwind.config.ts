import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // DEFAULT sits at teal-700 rather than teal-600: white-on-teal-600 is
        // 3.74:1, below the 4.5:1 this project targets, and the brand is used
        // as a button fill and as body-sized link text. teal-700 clears both
        // at 5.47:1. The numbered scale keeps its true Tailwind values.
        brand: {
          DEFAULT: "#0f766e",
          dark: "#115e59",
          50: "#f0fdfa",
          100: "#ccfbf1",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Shared with the desktop and patient-portal apps, which both declare the
      // same curve. Admin was the only workspace missing it, so every
      // `ease-out-fluid` here silently fell back to the default easing.
      transitionTimingFunction: {
        "out-fluid": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
