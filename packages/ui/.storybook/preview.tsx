import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import addonVitest from "@storybook/addon-vitest"
import { definePreview } from "@storybook/react-vite"

import "../src/styles/globals.css"

export default definePreview({
  addons: [addonA11y(), addonDocs(), addonThemes(), addonVitest()],
  decorators: [
    withThemeByClassName({
      themes: {
        light: "light",
        dark: "dark",
      },
      defaultTheme: "light",
    }),
  ],
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
  },
})
