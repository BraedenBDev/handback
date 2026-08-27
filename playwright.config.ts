import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8799", trace: "on-first-failure" },
  // Runs the real production build against a real server, not a dev shim.
  webServer: {
    command: "npm run build && HANDBACK_DB=e2e.sqlite PORT=8799 node server/index.ts",
    url: "http://localhost:8799",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
