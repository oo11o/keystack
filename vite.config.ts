import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { content: "src/content/inject.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
