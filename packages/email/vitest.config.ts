import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "./coverage/node",
      include: [
        "src/components/app-email.tsx",
        "src/config.ts",
        "src/providers/cloudflare.ts",
        "src/providers/configured.ts",
        "src/providers/console.ts",
        "src/providers/mailpit.ts",
        "src/providers/noop.ts",
        "src/render/index.ts",
        "src/templates/magic-link.tsx",
        "src/templates/organization-invitation.tsx",
        "src/templates/verification.tsx",
      ],
      thresholds: {
        statements: 97,
        branches: 89,
        functions: 100,
        lines: 97,
      },
    },
  },
})
