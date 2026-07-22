import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/control-plane/grant.ts",
        "src/context/budget.ts",
        "src/feature-flags.ts",
        "src/messages/canonical.ts",
        "src/messages/chat-input.ts",
        "src/messages/stream-parts.ts",
        "src/observability/privacy.ts",
        "src/runtime/request.ts",
        "src/runtime/resume-issue-action.ts",
        "src/runtime/settlement.ts",
        "src/runtime/stop-conditions.ts",
        "src/tools/budget.ts",
        "src/tools/client.ts",
        "src/tools/read.ts",
        "src/tools/write.ts",
        "src/usage/normalize.ts",
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
