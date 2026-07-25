import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineMain } from "@storybook/nextjs-vite/node"
import { mergeConfig } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const workspace = path.resolve(dirname, "..")

export default defineMain({
  stories: ["../{app,components,features}/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  docs: {
    defaultName: "Documentation",
  },
  async viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      define: {
        __dirname: JSON.stringify("/"),
        "process.env": "{}",
      },
      resolve: {
        alias: {
          "@": workspace,
          "@sentry/nextjs": path.join(
            workspace,
            "test-support/storybook/sentry-nextjs.ts"
          ),
          "next/link": path.join(
            workspace,
            "test-support/storybook/next-link.tsx"
          ),
          "next/navigation": path.join(
            workspace,
            "test-support/storybook/next-navigation.ts"
          ),
          "nuqs/adapters/next/app": path.join(
            workspace,
            "test-support/storybook/nuqs-next-app.ts"
          ),
          "server-only": path.join(
            workspace,
            "test-support/storybook/server-only.ts"
          ),
        },
      },
    })
  },
})
