import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    forceRerunTriggers: ["drizzle/**", "src/schema/**", "drizzle.config.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/development/seed-fixtures.ts",
        "src/development/reset.ts",
        "src/development/seed.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 75,
        lines: 80,
      },
    },
  },
})
