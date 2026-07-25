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
    "react",
    "react-perf",
  ],
  overrides: [
    {
      files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      rules: {
        // sender binding/logger mockはconsumer側interfaceから型を推論する。
        "vitest/require-mock-type-parameters": "off",
      },
    },
    ...createBudgetOverrides({
      adapter: ["src/{runtime,providers,development}/**/*.{ts,tsx}"],
      react: ["src/**/*.{jsx,tsx}"],
      testReact: true,
    }),
  ],
  rules: {
    ...workspaceBoundaryRule("email"),
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "error",
    "react-perf/jsx-no-new-array-as-prop": "error",
    "react-perf/jsx-no-new-function-as-prop": "error",
    "react-perf/jsx-no-new-object-as-prop": "error",
  },
  settings: {
    react: {
      version: "19.2.5",
    },
  },
})
