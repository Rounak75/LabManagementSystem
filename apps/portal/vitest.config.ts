import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: { alias: { "@portal": resolve(__dirname, "src") } },
  test: { environment: "node", globals: true, include: ["src/**/*.{test,spec}.ts"] },
});
