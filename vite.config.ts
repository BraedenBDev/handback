import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  // e2e/ is Playwright's; vitest cannot run it and would fail the file.
  test: { exclude: ["e2e/**", "node_modules/**", "dist/**"] },
});
