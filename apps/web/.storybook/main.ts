import path from "node:path"
import { fileURLToPath } from "node:url"

import type { StorybookConfig } from "@storybook/react-vite"
import react from "@vitejs/plugin-react"
import { mergeConfig } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const workspace = path.resolve(dirname, "..")

const config: StorybookConfig = {
  stories: ["../{app,components,features}/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    defaultName: "Documentation",
  },
  async viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      define: {
        "process.env": "{}",
      },
      plugins: [react()],
      resolve: {
        alias: {
          "@": workspace,
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
}

export default config
