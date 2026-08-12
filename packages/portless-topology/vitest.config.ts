import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    forceRerunTriggers: [
      "**/package.json",
      "**/{vitest,vite}.config.*",
      "**/vitest.setup.*",
      "**/vitest.browser.setup.*",
      "**/tsconfig.json",
    ],
    coverage: {
      enabled: false,
    },
  },
})
