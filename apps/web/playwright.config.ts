import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000"

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["oauth/**"],
  outputDir: "./test-results",
  // The local mock API intentionally keeps per-session state in memory. Keep
  // journeys serial so reset/setup is deterministic in CI and on laptops.
  fullyParallel: false,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "pixel-7-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-13-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: "bun run e2e:mock-api",
          url: "http://127.0.0.1:3001/health",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: "bun run dev:e2e",
          url: `${baseURL}/auth/sign-in`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            API_PUBLIC_URL: "http://127.0.0.1:3001",
            NEXT_DIST_DIR: ".next-e2e",
            NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001",
            NEXT_PUBLIC_AGENT_BASE_URL: "http://127.0.0.1:3002",
          },
        },
      ],
})
