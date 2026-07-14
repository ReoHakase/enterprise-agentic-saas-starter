import { defineConfig } from "oxlint"

import rootConfig from "../../oxlint.config.ts"

export default defineConfig({
  extends: [rootConfig],
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
  ],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "off",
  },
  settings: {
    react: {
      version: "19.2.5",
    },
  },
})
