import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { API_URL, APP_URL, e2eDirectory } from "./support/fixture";

const directory = e2eDirectory();
const artifacts = path.join(directory, "artifacts/web");

export default defineConfig({
  testDir: "tests",
  outputDir: path.join(directory, "private/playwright"),
  globalSetup: "./support/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  // A failed journey may already have changed server state, so a replay would start elsewhere.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  // No HTML reporter: it copies traces, which hold credentials.
  reporter: [
    ["list"],
    ["junit", { outputFile: path.join(artifacts, "junit.xml") }],
    ["json", { outputFile: path.join(artifacts, "results.json") }],
  ],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    timezoneId: "Europe/Amsterdam",
    locale: "en-US",
  },
  projects: [
    { name: "signup", testMatch: /signup\.spec\.ts/, use: devices["Desktop Chrome"] },
    { name: "app", testIgnore: /signup\.spec\.ts/, dependencies: ["signup"], use: devices["Desktop Chrome"] },
  ],
  webServer: {
    command: "bun run --cwd apps/web start --port 4100",
    cwd: path.resolve(__dirname, "../.."),
    url: `${APP_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_APP_URL: APP_URL, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
