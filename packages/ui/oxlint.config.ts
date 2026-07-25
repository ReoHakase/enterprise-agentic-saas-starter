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
    "jsx-a11y",
    "react",
    "react-perf",
  ],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "storybook", specifier: "eslint-plugin-storybook" },
    { name: "testing-library", specifier: "eslint-plugin-testing-library" },
  ],
  rules: {
    ...workspaceBoundaryRule("ui"),
    "func-style": "off",
    // role=status/group等を用途を見ずにoutput/fieldsetへ置換するため、ARIA設計は個別ruleで検証する。
    "jsx-a11y/prefer-tag-over-role": "off",
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "error",
    "react-perf/jsx-no-new-array-as-prop": "error",
    "react-perf/jsx-no-new-function-as-prop": "error",
    "react-perf/jsx-no-new-object-as-prop": "error",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    // class orderはroot oxfmt.config.tsのsortTailwindcssを単一の正本にする。
    "tailwindcss/enforce-sort-order": "off",
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
      files: ["src/components/calendar.tsx"],
      rules: {
        // React DayPickerのcomponents slotへ渡すmemoized rendererをnested componentと誤認する。
        "react/no-unstable-nested-components": "off",
      },
    },
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
    ...createBudgetOverrides({
      react: ["src/**/*.{jsx,tsx}"],
      testReact: true,
    }),
  ],
  env: {
    browser: true,
  },
  settings: {
    react: {
      version: "19.2.8",
    },
    tailwindcss: {
      entryPoint: "src/styles/globals.css",
      callees: ["cn", "cva", "clsx"],
    },
  },
})
