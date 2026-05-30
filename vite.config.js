import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
  base: "./",
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
  plugins: [{
    name: "copy-coi-serviceworker",
    closeBundle() {
      copyFileSync(
        resolve("node_modules/coi-serviceworker/coi-serviceworker.js"),
        resolve("build/coi-serviceworker.js"),
      );
    },
  }],
});
