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
  ],
  env: {
    node: true,
  },
  overrides: [
    {
      files: ["src/index.test.ts"],
      rules: {
        // Privacy regressionはprovider由来messageを契約にせず、throwとlog非漏洩を検証する。
        "jest/require-to-throw-message": "off",
      },
    },
  ],
})
