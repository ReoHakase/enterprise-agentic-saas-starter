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
    "jsx-a11y",
    "nextjs",
    "react",
    "react-perf",
  ],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "query", specifier: "@tanstack/eslint-plugin-query" },
    { name: "testing-library", specifier: "eslint-plugin-testing-library" },
    { name: "playwright", specifier: "eslint-plugin-playwright" },
  ],
  ignorePatterns: [
    ".next/**",
    ".open-next/**",
    ".turbo/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
  ],
  rules: {
    "import/no-unassigned-import": "off",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@enterprise-agentic-saas/api",
              "@enterprise-agentic-saas/api/*",
              "!@enterprise-agentic-saas/api/client",
            ],
            message:
              "apps/web may only import the Eden boundary from @enterprise-agentic-saas/api/client.",
          },
        ],
      },
    ],
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "error",
    "react-perf/jsx-no-new-array-as-prop": "error",
    "react-perf/jsx-no-new-function-as-prop": "error",
    "react-perf/jsx-no-new-object-as-prop": "error",
    "query/exhaustive-deps": "error",
    "query/infinite-query-property-order": "error",
    "query/mutation-property-order": "error",
    "query/no-rest-destructuring": "warn",
    "query/no-unstable-deps": "error",
    "query/no-void-query-fn": "error",
    "query/stable-query-client": "error",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "error",
    "tailwindcss/no-hardcoded-colors": "warn",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-unnecessary-whitespace": "error",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "vitest/expect-expect": "warn",
        "vitest/no-disabled-tests": "warn",
        "vitest/no-focused-tests": "error",
        "vitest/valid-expect": "error",
        "vitest/valid-title": "error",
        "testing-library/await-async-events": [
          "error",
          { eventModule: "userEvent" },
        ],
        "testing-library/await-async-queries": "error",
        "testing-library/await-async-utils": "error",
        "testing-library/no-container": "error",
        "testing-library/no-debugging-utils": "warn",
        "testing-library/no-node-access": "error",
        "testing-library/no-unnecessary-act": "error",
        "testing-library/prefer-find-by": "error",
        "testing-library/prefer-screen-queries": "error",
        "testing-library/prefer-user-event": "error",
      },
    },
    {
      files: ["e2e/**/*.ts"],
      rules: {
        "playwright/missing-playwright-await": "error",
        "playwright/no-focused-test": "error",
        "playwright/no-networkidle": "error",
        "playwright/no-page-pause": "error",
        "playwright/no-wait-for-timeout": "error",
        "playwright/prefer-web-first-assertions": "error",
        "playwright/valid-expect": "error",
        "playwright/valid-title": "error",
      },
    },
    {
      files: ["components/auth/**/*.tsx"],
      rules: {
        // Better Auth UI互換componentは公式surfaceと同じfunction declarationを保つ。
        "func-style": "off",
        // module augmentationはdeclaration mergingが必要なためinterfaceを使う。
        "typescript/consistent-type-definitions": "off",
      },
    },
    {
      files: ["lib/auth/auth-plugin.ts"],
      rules: {
        "typescript/consistent-type-definitions": "off",
      },
    },
  ],
  env: {
    browser: true,
  },
  settings: {
    next: {
      rootDir: ".",
    },
    react: {
      version: "19.2.5",
    },
    tailwindcss: {
      entryPoint: "../../packages/ui/src/styles/globals.css",
      callees: ["cn", "cva", "clsx"],
    },
  },
})
