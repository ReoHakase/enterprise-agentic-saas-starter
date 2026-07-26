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
    ...workspaceBoundaryRule("api"),
  },
  overrides: [
    {
      files: ["src/app.test.ts"],
      rules: {
        // Vitestはexpectの第2引数に診断messageを許可する。
        "jest/valid-expect": "off",
        // hoisted mockとEden transport mockは代入先の型から契約を固定する。
        "vitest/require-mock-type-parameters": "off",
      },
    },
    {
      files: ["src/modules/organizations/deletion-access.test.ts"],
      rules: {
        // thrown AppErrorのpublic fieldと秘密値非漏洩を同じcatchで検証する。
        "jest/no-conditional-expect": "off",
        "vitest/no-conditional-expect": "off",
      },
    },
    {
      files: ["src/modules/organizations/deletion-jobs.test.ts"],
      rules: {
        // R2 binding mockはindexed function typeまたは代入先interfaceで型付けする。
        "vitest/require-mock-type-parameters": "off",
      },
    },
    ...createBudgetOverrides({
      adapter: [
        "src/modules/**/{routes,repository,module}.ts",
        "src/modules/**/adapters/{http,persistence}/**/*.{ts,tsx}",
        "src/platform/**/*.ts",
        "src/{app,index,worker}.ts",
      ],
    }),
  ],
  env: {
    node: true,
  },
})
