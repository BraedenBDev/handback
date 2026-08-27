import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8787" }, // npm run dev:api (wrangler dev)
  },
  test: {
    // e2e/ belongs to Playwright. tests/worker/ runs inside workerd via
    // vitest.workers.config.ts and cannot execute in a node environment.
    exclude: ["e2e/**", "tests/worker/**", "node_modules/**", "dist/**"],
    // jsdom only exposes localStorage on a real origin; the default about:blank
    // leaves it undefined, which silently skips the storage paths.
    environmentOptions: { jsdom: { url: "https://handback.link/" } },
    setupFiles: ["./tests/setup-dom.ts"],
  },
});
