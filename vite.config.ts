import { defineConfig } from "vite";

// `base: "./"` emits relative asset paths so the production build works from any
// static host or sub-path (e.g. GitHub Pages project pages) without extra config.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500, // Babylon core is large; this keeps the build log quiet.
  },
});
