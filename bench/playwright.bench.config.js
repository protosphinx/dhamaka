import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "bench-browser.spec.js",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
  webServer: {
    command: "node packages/playground/server.js",
    port: 5173,
    reuseExistingServer: true,
    timeout: 10_000,
    cwd: "..",
  },
});
