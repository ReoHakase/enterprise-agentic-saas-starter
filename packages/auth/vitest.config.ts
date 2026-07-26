import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: [
        "src/client.ts",
        "src/github-oauth.ts",
        "src/index.ts",
        "src/server/adapters/github-user-info.ts",
        "src/server/github-oauth-environment.ts",
        "src/server/plugins/github-oauth-provider.ts",
        "src/session-organization.ts",
      ],
      thresholds: {
        statements: 92,
        branches: 90,
        functions: 100,
        lines: 92,
      },
    },
  },
})
