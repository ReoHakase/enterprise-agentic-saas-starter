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
    "react",
    "react-perf",
  ],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "storybook", specifier: "eslint-plugin-storybook" },
    { name: "testing-library", specifier: "eslint-plugin-testing-library" },
  ],
  ignorePatterns: [
    ".turbo/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "storybook-static/**",
    "test-results/**",
  ],
  rules: {
    "func-style": "off",
    "import/no-unassigned-import": "off",
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "error",
    "react-perf/jsx-no-new-array-as-prop": "error",
    "react-perf/jsx-no-new-function-as-prop": "error",
    "react-perf/jsx-no-new-object-as-prop": "error",
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
      files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      rules: {
        "vitest/no-disabled-tests": "warn",
        "vitest/no-focused-tests": "error",
        "vitest/valid-expect": "error",
        "testing-library/await-async-events": [
          "error",
          { eventModule: "userEvent" },
        ],
        "testing-library/await-async-queries": "error",
        "testing-library/await-async-utils": "error",
        "testing-library/no-container": "error",
        "testing-library/no-node-access": "error",
        "testing-library/prefer-screen-queries": "error",
        "testing-library/prefer-user-event": "error",
      },
    },
    {
      files: ["src/**/*.stories.ts", "src/**/*.stories.tsx"],
      rules: {
        "storybook/await-interactions": "error",
        "storybook/context-in-play-function": "error",
        "storybook/default-exports": "error",
        "storybook/no-redundant-story-name": "warn",
        "storybook/no-renderer-packages": "error",
        "storybook/prefer-pascal-case": "warn",
        "storybook/story-exports": "error",
        "storybook/use-storybook-expect": "error",
        "storybook/use-storybook-testing-library": "error",
      },
    },
    {
      files: ["src/components/label.tsx"],
      rules: {
        // このprimitiveはhtmlForまたはchildrenによる関連付けを呼び出し側へ委譲する。
        "jsx-a11y/label-has-associated-control": "off",
      },
    },
  ],
  env: {
    browser: true,
  },
  settings: {
    react: {
      version: "19.2.5",
    },
    tailwindcss: {
      entryPoint: "src/styles/globals.css",
      callees: ["cn", "cva", "clsx"],
    },
  },
})
