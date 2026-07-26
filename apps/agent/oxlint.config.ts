import { defineConfig } from "oxlint"

import rootConfig, {
  createBudgetOverrides,
  lintIgnorePatterns,
  workspaceBoundaryRule,
} from "../../oxlint.config.ts"

export default defineConfig({
  extends: [rootConfig],
  ignorePatterns: [...lintIgnorePatterns],
  plugins: [
    "import",
    "node",
    "promise",
    "typescript",
    "unicorn",
    "oxc",
    "vitest",
  ],
  rules: {
    ...workspaceBoundaryRule("agent"),
  },
  overrides: createBudgetOverrides({
    adapter: [
      "src/mastra/{adapters,composition}/**/*.{ts,tsx}",
      "src/mastra/{index,worker}.ts",
    ],
  }),
  env: {
    node: true,
  },
})
