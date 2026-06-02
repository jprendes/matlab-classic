import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";
import { constants } from "zlib";
import { compression } from "vite-plugin-compression2";

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
  plugins: [
    {
      name: "copy-coi-serviceworker",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "coi-serviceworker.js",
          source: readFileSync(resolve("node_modules/coi-serviceworker/coi-serviceworker.js"), "utf-8"),
        });
      },
    },
    compression({
      algorithm: "brotliCompress",
      include: [/\.(js|css|html|wasm)$/],
      compressionOptions: { level: constants.BROTLI_MAX_QUALITY },
    }),
    compression({
      algorithm: "gzip",
      include: [/\.(js|css|html|wasm)$/],
      compressionOptions: { level: constants.Z_BEST_COMPRESSION },
    }),
  ],
});
