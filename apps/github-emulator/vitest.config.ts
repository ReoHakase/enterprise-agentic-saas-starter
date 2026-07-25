import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: [
        "src/config/index.ts",
        "src/fixtures/github.ts",
        "src/server/emulator.ts",
        "src/state/lifecycle.ts",
      ],
      thresholds: {
        statements: 98,
        branches: 97,
        functions: 95,
        lines: 100,
      },
    },
  },
})
