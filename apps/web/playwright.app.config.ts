import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test"

import { nextjsIntegrationEnvironment } from "./test/app/fixtures/environment"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? nextjsIntegrationEnvironment.webOrigin

const appIntegrationConfig = {
  testDir: "./test/app",
  outputDir: "./test-results/app-integration",
  fullyParallel: true,
  workers: 3,
  failOnFlakyTests: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/app-integration" }],
  ],
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
          command: "bun run test:browser:mock-api",
          url: `${nextjsIntegrationEnvironment.apiOrigin}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: "bun run start:test:browser:app",
          url: `${baseURL}/auth/sign-in`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ...process.env,
            API_PUBLIC_URL: nextjsIntegrationEnvironment.apiOrigin,
            NEXT_DIST_DIR: ".next-browser",
            NEXT_PUBLIC_API_BASE_URL: nextjsIntegrationEnvironment.apiOrigin,
            PORT: String(nextjsIntegrationEnvironment.webPort),
          },
        },
      ],
} satisfies PlaywrightTestConfig

export default defineConfig({
  ...appIntegrationConfig,
  projects: [
    {
      name: "nextjs-integration-chromium",
      testIgnore: "webkit-representative.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "nextjs-integration-webkit-representative",
      testMatch: "webkit-representative.spec.ts",
      use: { ...devices["iPhone 13"] },
    },
  ],
})
