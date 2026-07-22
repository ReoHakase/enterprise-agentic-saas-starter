import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/chat-input.ts",
        "src/client-tools.ts",
        "src/connection-grant.ts",
        "src/connection-request.ts",
        "src/feature-flags.ts",
        "src/live-connection-grants.ts",
        "src/observability.ts",
        "src/protocol-message.ts",
        "src/read-tools.ts",
        "src/resume-issue-action.ts",
        "src/run-settlement.ts",
        "src/stop-conditions.ts",
        "src/tool-budget.ts",
        "src/write-tools.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
    },
  },
})
