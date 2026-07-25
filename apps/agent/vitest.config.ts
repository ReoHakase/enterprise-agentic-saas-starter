import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/mastra/adapters/telemetry/privacy.ts",
        "src/mastra/core/budget/context.ts",
        "src/mastra/core/budget/tool.ts",
        "src/mastra/core/messages/canonical.ts",
        "src/mastra/core/messages/chat-input.ts",
        "src/mastra/core/messages/stream-parts.ts",
        "src/mastra/core/policy/feature-flags.ts",
        "src/mastra/core/policy/grant.ts",
        "src/mastra/core/stop-conditions/index.ts",
        "src/mastra/core/usage/normalize.ts",
        "src/mastra/runtime/request.ts",
        "src/mastra/runtime/resume-action.ts",
        "src/mastra/runtime/settlement.ts",
        "src/mastra/tools/client/tool.ts",
        "src/mastra/tools/issues/read/execute.ts",
        "src/mastra/tools/issues/write/execute.ts",
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
