import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/client.ts",
        "src/github-oauth.ts",
        "src/github-oauth-provider.ts",
        "src/index.ts",
        "src/session-organization.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 70,
        lines: 75,
      },
    },
  },
})
