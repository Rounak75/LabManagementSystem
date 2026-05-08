import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: "#0e6ba8", dark: "#094471" }, danger: "#c0392b" },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] }
    }
  },
  plugins: []
} satisfies Config;
