import { defineConfig } from "vite";

// The first of three passes, and the only one that owns dist/ — see
// vite.background.config.ts for why there are three.
//
// emptyOutDir is off, which looks like an oversight and is not. Chrome loads
// this extension unpacked from dist/, and deleting that directory mid-build
// pulls the rug from under a running install: the card breaks, re-adding it
// counts as a fresh install, and chrome.storage.local — where every stack the
// user has built lives — goes with it. Every file here is written to a fixed
// name with no content hash, so overwriting in place is complete; `npm run
// clean` is there for the rare rename that leaves something stale behind, and
// costs the stored config exactly as described.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: { content: "src/content/inject.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
