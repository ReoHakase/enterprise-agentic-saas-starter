import { defineConfig, devices } from "@playwright/test"

import { appE2eConfig } from "./playwright.config"

export default defineConfig({
  ...appE2eConfig,
  testIgnore: [],
  testMatch: "route-contracts.spec.ts",
  outputDir: "./test-results/route-contracts",
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/route-contracts" }],
  ],
  projects: [
    {
      name: "e1-route-contracts-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
})
