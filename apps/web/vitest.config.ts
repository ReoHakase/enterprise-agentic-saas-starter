import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": dirname,
    },
  },
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "components/auth/runtime-guards.ts",
        "features/account/components/*.tsx",
        "features/account/multi-session-client.ts",
        "features/account/schema.ts",
        "features/account/security-client.ts",
        "features/auth/schema.ts",
        "features/console/api.ts",
        "features/issues/api.ts",
        "features/issues/components/*.{ts,tsx}",
        "features/issues/schema.ts",
        "features/members/api.ts",
        "features/members/components/*.tsx",
        "features/members/schema.ts",
        "features/organizations/components/*.tsx",
        "features/organizations/schema.ts",
        "lib/auth/redirect-to.ts",
        "lib/observability/sentry-runtime.ts",
        "lib/observability/sentry-scrub.ts",
        "lib/server/auth-session-response.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 55,
        functions: 65,
        lines: 75,
      },
    },
    environment: "happy-dom",
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
