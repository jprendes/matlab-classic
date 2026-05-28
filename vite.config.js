import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const coiSW = readFileSync(require.resolve("coi-serviceworker/coi-serviceworker.min.js"), "utf-8");

export default defineConfig({
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
    name: "coi-serviceworker",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "coi-serviceworker.js", source: coiSW });
    },
  }],
});
