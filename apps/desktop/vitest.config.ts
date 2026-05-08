import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve("src/renderer"), "@main": resolve("src/main"), "@shared": resolve("src/shared") } },
  test: {
    environment: "jsdom",
    setupFiles: ["src/renderer/test/setup.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"]
  }
});
