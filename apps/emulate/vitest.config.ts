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
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: ["app/**/route.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
