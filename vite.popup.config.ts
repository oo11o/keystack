import { defineConfig } from "vite";

// Separate build from vite.config.ts: each iife bundle must be its own
// single-entry build, so the popup script builds independently and lands
// in the same dist/ alongside content.js (see package.json's build script).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: { popup: "src/popup/main.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
