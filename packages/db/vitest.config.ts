import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    forceRerunTriggers: ["drizzle/**", "src/schema/**", "drizzle.config.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: [
        "src/development/seed-fixtures.ts",
        "src/development/reset.ts",
        "src/development/seed.ts",
      ],
      thresholds: {
        statements: 94,
        branches: 75,
        functions: 93,
        lines: 95,
      },
    },
  },
})
