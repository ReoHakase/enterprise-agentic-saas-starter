import path from "node:path"
import { fileURLToPath } from "node:url"

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const relatedMode = process.env.VITEST_RELATED === "1"
const unitCoverageEnabled = process.argv.includes("--project=unit")
const browserCoverageEnabled = process.env.BROWSER_COVERAGE === "1"
const nodeCoverageIncludes = [
  "src/components/button/button.tsx",
  "src/components/dialog/dialog.tsx",
  "src/lib/create-cropped-image.ts",
  "src/lib/utils.ts",
]
const browserCoverageIncludes = [
  "src/components/**/*.{ts,tsx}",
  "src/hooks/**/*.{ts,tsx}",
  "src/lib/**/*.{ts,tsx}",
]
const coverageExcludes = [
  "**/*.d.ts",
  "**/*.stories.tsx",
  "**/*.test.{ts,tsx}",
  "**/*.browser.test.{ts,tsx}",
  "**/test-support/**",
]
const unitTest = (name: string) => ({
  name,
  environment: "happy-dom",
  include: ["src/**/*.test.{ts,tsx}"],
  setupFiles: ["./vitest.setup.ts"],
})

const storybookProject = (theme: "light" | "dark") => ({
  extends: true as const,
  plugins: [
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      initialGlobals: { theme },
      ...(theme === "dark" ? { tags: { include: ["theme-sensitive"] } } : {}),
    }),
  ],
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
  optimizeDeps: {
    include: [
      "@base-ui/react/alert-dialog",
      "@base-ui/react/drawer",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
    ],
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
              statements: 91,
              branches: 83,
              functions: 87,
              lines: 90,
            },
          }),
    },
    ...(relatedMode
      ? unitTest("ui-unit")
      : {
          projects: [
            {
              test: unitTest("unit"),
            },
            storybookProject("light"),
            storybookProject("dark"),
          ],
        }),
  },
})
