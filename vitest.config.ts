import { defineConfig } from "vitest/config"

const relatedMode = process.env.VITEST_RELATED === "1"

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    ...(relatedMode
      ? {
          forceRerunTriggers: [
            "**/package.json",
            "**/{vitest,vite}*.config.*",
            "**/vitest.setup.*",
            "**/vitest.browser.setup.*",
            "**/tsconfig.json",
            "**/drizzle/**",
            "**/src/schema/**",
            "**/drizzle.config.ts",
          ],
          projects: [
            {
              test: {
                name: "root-unit",
                include: [".github/**/*.test.ts", "scripts/**/*.test.ts"],
              },
            },
            "apps/agent/vitest.config.ts",
            "apps/api/vitest.config.ts",
            "apps/emulate/vitest.config.ts",
            "apps/web/vitest.config.ts",
            "packages/agent-contracts/vitest.config.ts",
            "packages/agent-tools/vitest.config.ts",
            "packages/auth/vitest.config.ts",
            "packages/db/vitest.config.ts",
            "packages/email/vitest.config.ts",
            "packages/portless-topology/vitest.config.ts",
            "packages/ui/vitest.config.ts",
          ],
        }
      : {
          include: [".github/**/*.test.ts", "scripts/**/*.test.ts"],
        }),
  },
})
