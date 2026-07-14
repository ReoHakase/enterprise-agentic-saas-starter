import path from "node:path"
import { fileURLToPath } from "node:url"

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const unitCoverageEnabled = process.argv.includes("--project=unit")

const storybookProject = (theme: "light" | "dark") => ({
  extends: true as const,
  plugins: [
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      initialGlobals: { theme },
      storybookScript: "bun run storybook",
    }),
  ],
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
  optimizeDeps: {
    include: ["@base-ui/react/alert-dialog", "@base-ui/react/drawer"],
  },
  test: {
    coverage: {
      enabled: unitCoverageEnabled,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/components/button.tsx",
        "src/components/dialog.tsx",
        "src/lib/utils.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 65,
        lines: 70,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      storybookProject("light"),
      storybookProject("dark"),
    ],
  },
})
