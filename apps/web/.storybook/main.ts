import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineMain } from "@storybook/nextjs-vite/node"
import { mergeConfig } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const workspace = path.resolve(dirname, "..")

const getPortlessClientPort = () => {
  const portlessUrl = process.env.PORTLESS_URL
  if (!portlessUrl) return undefined

  const url = new URL(portlessUrl)
  if (url.port) return Number(url.port)

  return url.protocol === "https:" ? 443 : 80
}

export default defineMain({
  stories: ["../src/{app,components,features}/**/*.stories.@(ts|tsx)"],
  staticDirs: ["./public"],
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
    const clientPort = getPortlessClientPort()

    return mergeConfig(baseConfig, {
      ...(clientPort === undefined
        ? {}
        : {
            server: {
              ws: {
                clientPort,
              },
            },
          }),
      define: {
        __dirname: JSON.stringify("/"),
        "process.env": "{}",
      },
      resolve: {
        alias: {
          "@": path.join(workspace, "src"),
          "next-themes": path.join(
            workspace,
            "src/test-support/storybook/next-themes.tsx"
          ),
          "nuqs/adapters/next/app": path.join(
            workspace,
            "src/test-support/storybook/nuqs-next-app.ts"
          ),
        },
      },
    })
  },
})
