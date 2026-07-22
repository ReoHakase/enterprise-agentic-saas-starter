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
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@enterprise-agentic-saas/api",
              "@enterprise-agentic-saas/api/*",
              "!@enterprise-agentic-saas/api/agent-client",
            ],
            message:
              "apps/agent may only import the private control-plane contract from @enterprise-agentic-saas/api/agent-client.",
          },
          {
            group: [
              "@enterprise-agentic-saas/db",
              "@enterprise-agentic-saas/db/*",
            ],
            message:
              "apps/agent must access tenant data through the private API binding.",
          },
        ],
      },
    ],
  },
  env: {
    node: true,
  },
})
