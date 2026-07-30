import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: [
        "src/app.ts",
        "src/client.ts",
        "src/modules/organizations/routes/deletion-access.ts",
        "src/modules/organizations/deletion-jobs.ts",
        "src/platform/observability/otel-adapter.ts",
        "src/platform/plugins/request-id.ts",
      ],
      thresholds: {
        statements: 87,
        branches: 68,
        functions: 91,
        lines: 88,
      },
    },
  },
})
