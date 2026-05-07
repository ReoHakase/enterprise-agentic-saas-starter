import { defineConfig } from "oxlint"

import rootConfig from "../../oxlint.config.ts"

export default defineConfig({
  extends: [rootConfig],
  plugins: ["jsx-a11y", "nextjs", "react", "react-perf"],
  jsPlugins: ["oxlint-tailwindcss"],
  ignorePatterns: ["components/auth/**", "lib/auth/auth-plugin.ts"],
  rules: {
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
