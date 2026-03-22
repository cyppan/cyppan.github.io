import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/media": "http://localhost:3000",
    },
    watch: {
      // Use polling so file changes from external tools (Claude Code, scripts)
      // are reliably detected — macOS FSEvents can miss atomic writes.
      usePolling: true,
      interval: 500,
    },
  },
  build: {
    outDir: "dist/client",
  },
});
