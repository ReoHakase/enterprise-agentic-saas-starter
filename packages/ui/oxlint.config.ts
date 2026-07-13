import { defineConfig } from "oxlint"

import rootConfig from "../../oxlint.config.ts"

export default defineConfig({
  extends: [rootConfig],
  plugins: ["jsx-a11y", "react", "react-perf"],
  jsPlugins: ["oxlint-tailwindcss"],
  ignorePatterns: [
    ".turbo/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "storybook-static/**",
    "test-results/**",
    "src/components/calendar.tsx",
    "src/components/card.tsx",
    "src/components/checkbox.tsx",
    "src/components/combobox.tsx",
    "src/components/field.tsx",
    "src/components/input-group.tsx",
    "src/components/input.tsx",
    "src/components/label.tsx",
    "src/components/popover.tsx",
    "src/components/select.tsx",
    "src/components/separator.tsx",
    "src/components/slider.tsx",
    "src/components/sonner.tsx",
    "src/components/spinner.tsx",
    "src/components/switch.tsx",
    "src/components/textarea.tsx",
  ],
  rules: {
    "func-style": "off",
    "import/no-unassigned-import": "off",
    "react/react-in-jsx-scope": "off",
    "react-perf/jsx-no-jsx-as-prop": "off",
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
