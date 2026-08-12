import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    forceRerunTriggers: [
      "**/package.json",
      "**/{vitest,vite}*.config.*",
      "**/vitest.setup.*",
      "**/vitest.browser.setup.*",
      "**/tsconfig.json",
      "**/drizzle/**",
      "**/src/schema/**",
      "**/drizzle.config.ts",
    ],
    projects: [
      {
        test: {
          name: "root-unit",
          include: [".github/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        root: "apps/agent",
        test: { name: "@enterprise-agentic-saas/agent" },
      },
      {
        root: "apps/api",
        test: { name: "@enterprise-agentic-saas/api" },
      },
      {
        root: "apps/emulate",
        test: { name: "@enterprise-agentic-saas/emulate" },
      },
      {
        root: "apps/web",
        oxc: {
          jsx: {
            runtime: "automatic",
          },
        },
        resolve: {
          alias: {
            "@": path.resolve("apps/web/src"),
            "next/link": path.resolve(
              "apps/web/test-support/storybook/next-link.tsx"
            ),
          },
        },
        test: {
          name: "web-unit",
          environment: "happy-dom",
          include: [
            "*.test.{ts,tsx}",
            "src/instrumentation*.test.ts",
            "src/{components,features,hooks,lib}/**/*.test.{ts,tsx}",
            "testing/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/*.browser.test.{ts,tsx}"],
          setupFiles: [path.resolve("apps/web/vitest.setup.ts")],
        },
      },
      {
        root: "packages/agent-contracts",
        test: { name: "@enterprise-agentic-saas/agent-contracts" },
      },
      {
        root: "packages/agent-tools",
        test: { name: "@enterprise-agentic-saas/agent-tools" },
      },
      {
        root: "packages/auth",
        test: { name: "@enterprise-agentic-saas/auth" },
      },
      {
        root: "packages/db",
        test: { name: "@enterprise-agentic-saas/db" },
      },
      {
        root: "packages/email",
        test: { name: "@enterprise-agentic-saas/email" },
      },
      {
        root: "packages/portless-topology",
        test: { name: "@enterprise-agentic-saas/portless-topology" },
      },
      {
        root: "packages/ui",
        optimizeDeps: {
          include: [
            "@base-ui/react/alert-dialog",
            "@base-ui/react/drawer",
            "@base-ui/react/toggle",
            "@base-ui/react/toggle-group",
          ],
        },
        test: {
          name: "ui-unit",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [path.resolve("packages/ui/vitest.setup.ts")],
        },
      },
    ],
  },
})
