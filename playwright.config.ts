import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Isolated browser E2E for Little Finds MY.
// - Production server on its own port (3107), started and stopped by Playwright. Never the dev server.
// - The installed Microsoft Edge (channel "msedge"): no browser download. Each test gets a fresh,
//   throwaway browser context, so the user's own profile and saved data are never touched.
// - A different origin from localhost:3000, so synthetic test data can't reach real app data.
// Run after `npm run build` (the quality-gates script builds first).
const PORT = 3107;

if (!existsSync(".next/BUILD_ID")) {
  throw new Error("No production build found. Run `npm.cmd run build` before `npm.cmd run test:e2e`.");
}

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false, // never attach to some other process on this port
    timeout: 120_000,
  },
});
