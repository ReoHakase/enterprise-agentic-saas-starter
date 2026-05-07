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
    "react",
    "react-perf",
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
