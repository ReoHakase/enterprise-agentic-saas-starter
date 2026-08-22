import { defineConfig } from "oxlint"
import {
  NEXTJS_RULES,
  RECOMMENDED_RULES,
  TANSTACK_QUERY_RULES,
} from "oxlint-plugin-react-doctor"

import rootConfig, {
  createBudgetOverrides,
  lintIgnorePatterns,
  workspaceBoundaryRule,
} from "../../oxlint.config.ts"

const featureApiBoundary = [
  {
    group: ["@/features/*/api"],
    message:
      "Feature API entrypoints are limited to browser and server client composition.",
  },
]

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
    "nextjs",
    "react",
    "react-perf",
  ],
  jsPlugins: [
    "oxlint-tailwindcss",
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
    { name: "query", specifier: "@tanstack/eslint-plugin-query" },
    { name: "storybook", specifier: "eslint-plugin-storybook" },
    { name: "testing-library", specifier: "eslint-plugin-testing-library" },
    { name: "playwright", specifier: "eslint-plugin-playwright" },
  ],
  rules: {
    ...workspaceBoundaryRule("web", featureApiBoundary),
    ...RECOMMENDED_RULES,
    ...NEXTJS_RULES,
    ...TANSTACK_QUERY_RULES,
    // React Compilerは導入しないため、手動memo化の整理を要求する提案ruleは適用しない。
    "react-doctor/react-compiler-no-manual-memoization": "off",
    // Feature public barrels make every exported surface visible to the import graph.
    // Keep direct-cycle detection while component composition is routed through index.ts.
    "import/no-cycle": [
      "error",
      { ignoreExternal: false, ignoreTypes: true, maxDepth: 1 },
    ],
    // role=status/group等を用途を見ずにoutput/fieldsetへ置換するため、ARIA設計は個別ruleで検証する。
    "jsx-a11y/prefer-tag-over-role": "off",
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
      files: ["src/lib/browser/**/*.{ts,tsx}", "src/lib/server/**/*.{ts,tsx}"],
      rules: {
        ...workspaceBoundaryRule("web"),
      },
    },
    {
      files: [
        "src/features/members/components/invitations-section/invitations-section.tsx",
        "src/features/members/components/members-table/members-table.tsx",
        "src/features/organizations/components/organizations-page/organizations-page.tsx",
      ],
      rules: {
        // TanStack Tableのmemoized column cell/header rendererをnested componentと誤認する。
        "react/no-unstable-nested-components": "off",
      },
    },
    {
      files: [
        "src/components/public-route-suspense/public-route-suspense.tsx",
        "src/features/console/components/console-shell-navigation/console-shell-navigation.tsx",
        "src/features/issues/components/issues-table-content/issues-table-content.tsx",
        "src/features/members/components/members-table/member-table-columns.tsx",
      ],
      rules: {
        // これらのファイルでは、小さなrendererをcomposition rootと意図的に同じ場所へ配置する。
        "react-doctor/no-multi-comp": "off",
      },
    },
    {
      files: ["src/features/auth/components/sign-up/sign-up.tsx"],
      rules: {
        // Better Auth UIでは、controllerの結果を1つのcomposition boundaryとして保持する。
        "react-doctor/no-many-boolean-props": "off",
      },
    },
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
      files: [
        "src/features/files/components/file-attachments/file-attachments.test.tsx",
        "src/features/issues/components/issues-workspace/issues-workspace.test.tsx",
        "src/features/members/components/invitation-decision-panel/invitation-decision-panel.test.tsx",
        "src/features/organizations/components/organization-activation-gate/organization-activation-gate.test.tsx",
      ],
      rules: {
        // VitestのimportOriginalへmodule全体の型を渡し、namespace import宣言を避ける。
        "typescript/consistent-type-imports": [
          "error",
          {
            prefer: "type-imports",
            fixStyle: "inline-type-imports",
            disallowTypeAnnotations: false,
          },
        ],
      },
    },
    {
      files: ["e2e/**/*.ts"],
      rules: {
        "playwright/missing-playwright-await": "error",
        "playwright/no-element-handle": "error",
        "playwright/no-focused-test": "error",
        "playwright/no-force-option": "error",
        "playwright/no-networkidle": "error",
        "playwright/no-page-pause": "error",
        "playwright/no-wait-for-timeout": "error",
        "playwright/prefer-native-locators": "error",
        "playwright/prefer-web-first-assertions": "error",
        "playwright/valid-expect": "error",
        "playwright/valid-title": "error",
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
      files: ["src/features/auth/components/**/*.tsx"],
      rules: {
        // Better Auth UI互換componentは公式surfaceと同じfunction declarationを保つ。
        "func-style": "off",
        // module augmentationはdeclaration mergingが必要なためinterfaceを使う。
        "typescript/consistent-type-definitions": "off",
      },
    },
    {
      files: ["src/features/auth/auth-plugin.ts"],
      rules: {
        "typescript/consistent-type-definitions": "off",
      },
    },
    ...createBudgetOverrides({
      adapter: [
        "src/lib/server/**/*.{ts,tsx}",
        "**/*.config.{js,mjs,cjs,ts,mts,cts}",
      ],
      react: ["src/{app,components,features,hooks}/**/*.{jsx,tsx}"],
      testReact: true,
    }),
  ],
  env: {
    browser: true,
  },
  settings: {
    next: {
      rootDir: ".",
    },
    react: {
      version: "19.2.8",
    },
    tailwindcss: {
      entryPoint: "../../packages/ui/src/styles/globals.css",
      callees: ["cn", "cva", "clsx"],
    },
  },
})
