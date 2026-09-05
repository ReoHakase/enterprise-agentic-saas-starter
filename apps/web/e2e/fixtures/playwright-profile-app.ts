import { devices, type PlaywrightTestConfig } from "@playwright/test"

import { tanStackStartIntegrationEnvironment } from "../app/fixtures/environment"

export const createAppPlaywrightProfile = (): PlaywrightTestConfig => {
  const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
  const baseURL =
    externalBaseUrl ?? tanStackStartIntegrationEnvironment.webOrigin

  return {
    testDir: "./e2e/app",
    outputDir: "./test-results/tanstack-start-integration",
    fullyParallel: true,
    workers: 3,
    failOnFlakyTests: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [
      ["list"],
      [
        "html",
        { outputFolder: "playwright-report/tanstack-start-integration" },
      ],
    ],
    use: {
      baseURL,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "on",
    },
    projects: [
      {
        name: "tanstack-start-integration-chromium",
        testIgnore: "webkit-representative.spec.ts",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 1280, height: 720 },
        },
      },
      {
        name: "tanstack-start-integration-webkit-representative",
        testMatch: "webkit-representative.spec.ts",
        use: { ...devices["iPhone 13"] },
      },
    ],
    webServer: externalBaseUrl
      ? undefined
      : [
          {
            command: "bun run test:browser:mock-api",
            url: `${tanStackStartIntegrationEnvironment.apiOrigin}/health`,
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
              API_PUBLIC_URL: tanStackStartIntegrationEnvironment.apiOrigin,
              VITE_API_BASE_URL: tanStackStartIntegrationEnvironment.apiOrigin,
            },
          },
        ],
  }
}
