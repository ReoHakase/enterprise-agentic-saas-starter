import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000"

export const appE2eConfig = {
  testDir: "./e2e",
  outputDir: "./test-results/app",
  fullyParallel: true,
  workers: 3,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report/app" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: "bun run e2e:mock-api",
          url: "http://127.0.0.1:3001/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: "bun run dev:e2e",
          url: `${baseURL}/auth/sign-in`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ...process.env,
            API_PUBLIC_URL: "http://127.0.0.1:3001",
            NEXT_DIST_DIR: ".next-e2e",
            NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001",
          },
        },
      ],
} satisfies PlaywrightTestConfig

export default defineConfig({
  ...appE2eConfig,
  testIgnore: ["**/oauth/**", "**/agent/**", "route-contracts.spec.ts"],
  projects: [
    {
      name: "e1-chromium",
      testIgnore: [
        "**/agent/**",
        "**/oauth/**",
        "e1-webkit.spec.ts",
        "route-contracts.spec.ts",
      ],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "e1-webkit-representative",
      testMatch: ["e1-webkit.spec.ts"],
      use: { ...devices["iPhone 13"] },
    },
  ],
})
