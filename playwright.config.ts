import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8799", trace: "retain-on-failure" },
  projects: [
    {
      name: "mocked",
      testIgnore: "**/native-webmcp.spec.ts",
    },
    {
      // The real API, not a stand-in. Chromium exposes document.modelContext
      // behind --enable-features=WebMCP, which is the same switch as
      // chrome://flags/#enable-webmcp-testing. Everything else in e2e/ drives a
      // faithful mock; this project proves the mock is faithful.
      name: "native-webmcp",
      testMatch: "**/native-webmcp.spec.ts",
      use: { launchOptions: { args: ["--enable-features=WebMCP"] } },
    },
  ],
  // Runs the real production build on the real Worker runtime, against a local
  // D1 built from migrations/ — the same artifact that gets deployed.
  webServer: {
    command:
      "npm run build && wrangler d1 migrations apply handback --local --persist-to .wrangler/e2e && wrangler dev --port 8799 --persist-to .wrangler/e2e",
    url: "http://localhost:8799",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
