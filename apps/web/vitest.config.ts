import path from "node:path"
import { fileURLToPath } from "node:url"

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const unitCoverageEnabled = process.argv.includes("--project=unit")
const browserCoverageEnabled = process.env.BROWSER_COVERAGE === "1"
const nodeCoverageIncludes = [
  "components/auth/runtime-guards.ts",
  "features/account/components/**/*.tsx",
  "features/account/multi-session-client.ts",
  "features/account/schema.ts",
  "features/account/security-client.ts",
  "features/auth/error.ts",
  "features/auth/schema.ts",
  "features/console/api.ts",
  "features/issues/api.ts",
  "features/issues/components/**/*.{ts,tsx}",
  "features/issues/schema.ts",
  "features/members/api.ts",
  "features/members/components/**/*.tsx",
  "features/members/schema.ts",
  "features/organizations/components/**/*.tsx",
  "features/organizations/schema.ts",
  "lib/auth/redirect-to.ts",
  "lib/observability/sentry-runtime.ts",
  "lib/observability/sentry-scrub.ts",
  "lib/server/auth-session-response.ts",
]
const browserCoverageIncludes = [
  "components/**/*.{ts,tsx}",
  "features/**/components/**/*.{ts,tsx}",
  "features/**/hooks/**/*.{ts,tsx}",
  "hooks/**/*.{ts,tsx}",
]
const coverageExcludes = [
  "**/*.d.ts",
  "**/*.stories.tsx",
  "**/*.test.{ts,tsx}",
  "**/*.browser.test.{ts,tsx}",
  "**/test-support/**",
]
const browserAliases = {
  "@sentry/nextjs": path.join(
    dirname,
    "test-support/storybook/sentry-nextjs.ts"
  ),
  "next/link": path.join(dirname, "test-support/storybook/next-link.tsx"),
  "next/navigation": path.join(
    dirname,
    "test-support/storybook/next-navigation.ts"
  ),
  "nuqs/adapters/next/app": path.join(
    dirname,
    "test-support/storybook/nuqs-next-app.ts"
  ),
  "server-only": path.join(dirname, "test-support/storybook/server-only.ts"),
}
const unitAliases = {
  "next/link": browserAliases["next/link"],
}

const storybookProject = (theme: "light" | "dark") => ({
  extends: true as const,
  define: {
    __dirname: JSON.stringify("/"),
    "process.env": "{}",
  },
  plugins: [
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      initialGlobals: { theme },
      storybookScript: "bun run storybook",
      ...(theme === "dark" ? { tags: { include: ["theme-sensitive"] } } : {}),
    }),
  ],
  resolve: { alias: browserAliases },
  test: {
    name: `storybook-${theme}`,
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: "chromium" as const }],
    },
  },
})

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": dirname,
    },
  },
  test: {
    coverage: {
      enabled: unitCoverageEnabled || browserCoverageEnabled,
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: browserCoverageEnabled
        ? "./coverage/browser"
        : "./coverage/node",
      include: browserCoverageEnabled
        ? browserCoverageIncludes
        : nodeCoverageIncludes,
      exclude: coverageExcludes,
      ...(browserCoverageEnabled
        ? {}
        : {
            thresholds: {
              statements: 85,
              branches: 71,
              functions: 81,
              lines: 86,
            },
          }),
    },
    projects: [
      {
        extends: true,
        resolve: { alias: unitAliases },
        test: {
          name: "unit",
          environment: "happy-dom",
          include: [
            "*.test.{ts,tsx}",
            "{components,features,hooks,lib,testing}/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/*.browser.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      storybookProject("light"),
      storybookProject("dark"),
      {
        extends: true,
        define: {
          "process.env": "{}",
        },
        resolve: { alias: browserAliases },
        test: {
          name: "browser",
          include: [
            "{components,features,hooks,lib,testing}/**/*.browser.test.{ts,tsx}",
          ],
          setupFiles: ["./vitest.browser.setup.ts"],
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
