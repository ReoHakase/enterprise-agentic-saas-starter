import { defineConfig } from "oxlint"

import rootConfig from "../../oxlint.config.ts"

export default defineConfig({
  extends: [rootConfig],
  plugins: ["import", "node", "promise", "typescript", "unicorn", "oxc"],
  env: {
    node: true,
  },
})
