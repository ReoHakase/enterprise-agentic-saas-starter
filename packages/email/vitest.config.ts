import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/components/app-email.tsx",
        "src/config.ts",
        "src/render.ts",
        "src/senders/cloudflare.ts",
        "src/senders/configured.ts",
        "src/senders/console.ts",
        "src/senders/noop.ts",
        "src/templates/magic-link.tsx",
        "src/templates/organization-invitation.tsx",
        "src/templates/verification.tsx",
      ],
      thresholds: {
        statements: 90,
        branches: 65,
        functions: 90,
        lines: 90,
      },
    },
  },
})
