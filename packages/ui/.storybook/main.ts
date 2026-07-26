import { defineMain } from "@storybook/react-vite/node"
import { mergeConfig } from "vite"

const getPortlessClientPort = () => {
  const portlessUrl = process.env.PORTLESS_URL
  if (!portlessUrl) return undefined

  const url = new URL(portlessUrl)
  if (url.port) return Number(url.port)

  return url.protocol === "https:" ? 443 : 80
}

export default defineMain({
  stories: ["../src/**/*.stories.@(ts|tsx)"],
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
    const clientPort = getPortlessClientPort()
    if (clientPort === undefined) return baseConfig

    return mergeConfig(baseConfig, {
      server: {
        ws: {
          clientPort,
        },
      },
    })
  },
})
