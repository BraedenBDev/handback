import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8799", trace: "retain-on-failure" },
  // Runs the real production build on the real Worker runtime, against a local
  // D1 built from migrations/ — the same artifact that gets deployed.
  webServer: {
    command:
      "npm run build && wrangler d1 execute handback --local --persist-to .wrangler/e2e --file=./migrations/0001_initial.sql && wrangler dev --port 8799 --persist-to .wrangler/e2e",
    url: "http://localhost:8799",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
