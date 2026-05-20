import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@lab/db", "@lab/types", "@lab/reports", "@react-pdf/renderer"] })],
    resolve: { alias: { "@main": resolve("src/main"), "@shared": resolve("src/shared") } },
    esbuild: { jsx: "automatic" },
    build: { outDir: "out/main" }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("src/shared") } },
    build:   { outDir: "out/preload" }
  },
  renderer: {
    root: ".",
    plugins: [react()],
    resolve: { alias: { "@": resolve("src/renderer"), "@shared": resolve("src/shared") } },
    build: { outDir: "out/renderer", rollupOptions: { input: resolve("index.html") } },
    server: { port: 5173 }
  }
});
