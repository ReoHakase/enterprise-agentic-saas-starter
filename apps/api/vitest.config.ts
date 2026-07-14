import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/app.ts",
        "src/client.ts",
        "src/modules/organizations/deletion-access.ts",
        "src/modules/organizations/deletion-jobs.ts",
        "src/observability/sanitize.ts",
        "src/observability/spotlight.ts",
        "src/plugins/request-id.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 80,
        lines: 70,
      },
    },
  },
})
