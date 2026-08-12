import path from "node:path"
import { fileURLToPath } from "node:url"

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const relatedMode = process.env.VITEST_RELATED === "1"
const unitCoverageEnabled = process.argv.includes("--project=unit")
const browserCoverageEnabled = process.env.BROWSER_COVERAGE === "1"
const nodeCoverageIncludes = [
  "src/features/auth/runtime-guards.ts",
  "src/features/account/components/**/*.tsx",
  "src/features/account/multi-session-client.ts",
  "src/features/account/schema.ts",
  "src/features/account/security-client.ts",
  "src/features/auth/error.ts",
  "src/features/auth/schema.ts",
  "src/features/console/api.ts",
  "src/features/issues/api.ts",
  "src/features/issues/components/**/*.{ts,tsx}",
  "src/features/issues/schema.ts",
  "src/features/members/api.ts",
  "src/features/members/components/**/*.tsx",
  "src/features/members/schema.ts",
  "src/features/organizations/components/**/*.tsx",
  "src/features/organizations/schema.ts",
  "src/features/auth/redirect-to.ts",
  "src/lib/report-observed-error.ts",
  "src/lib/server/auth-session-response.ts",
]
const browserCoverageIncludes = [
  "src/components/**/*.{ts,tsx}",
  "src/features/**/components/**/*.{ts,tsx}",
  "src/features/**/hooks/**/*.{ts,tsx}",
  "src/hooks/**/*.{ts,tsx}",
]
const coverageExcludes = [
  "**/*.d.ts",
  "**/*.stories.tsx",
  "**/*.test.{ts,tsx}",
  "**/*.browser.test.{ts,tsx}",
  "**/test-support/**",
]
const browserAliases = {
  "next/link": path.join(dirname, "test-support/storybook/next-link.tsx"),
  "next/navigation": path.join(
    dirname,
    "test-support/storybook/next-navigation.ts"
  ),
  "next-themes": path.join(dirname, "test-support/storybook/next-themes.tsx"),
  "nuqs/adapters/next/app": path.join(
    dirname,
    "test-support/storybook/nuqs-next-app.ts"
  ),
  "server-only": path.join(dirname, "test-support/storybook/server-only.ts"),
}
const unitAliases = {
  "next/link": browserAliases["next/link"],
}
const unitTest = (name: string) => ({
  name,
  environment: "happy-dom",
  include: [
    "*.test.{ts,tsx}",
    "src/instrumentation*.test.ts",
    "src/{components,features,hooks,lib}/**/*.test.{ts,tsx}",
    "testing/**/*.test.{ts,tsx}",
  ],
  exclude: ["**/*.browser.test.{ts,tsx}"],
  setupFiles: ["./vitest.setup.ts"],
})
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
      ...(theme === "dark" ? { tags: { include: ["theme-sensitive"] } } : {}),
    }),
  ],
  resolve: { alias: browserAliases },
  test: {
    name: `storybook-${theme}`,
    fileParallelism: false,
    maxWorkers: 1,
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: "chromium" as const }],
    },
  },
})

export default defineConfig({
  root: dirname,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(dirname, "src"),
      ...(relatedMode ? unitAliases : {}),
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
    ...(relatedMode
      ? unitTest("web-unit")
      : {
          projects: [
            {
              extends: true,
              resolve: { alias: unitAliases },
              test: unitTest("unit"),
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
                  "src/{components,features,hooks,lib}/**/*.browser.test.{ts,tsx}",
                  "testing/**/*.browser.test.{ts,tsx}",
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
        }),
  },
})
