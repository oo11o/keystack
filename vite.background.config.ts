import { defineConfig } from "vite";

// A separate config, not a second entry in vite.config.ts: Rollup's iife
// output format rejects multiple inputs outright (not just ones that would
// share a chunk), so the service worker gets its own build, run after the
// main one — emptyOutDir/publicDir are both off so it doesn't clobber what
// `vite build` already wrote to dist/.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: { background: "src/background/worker.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
