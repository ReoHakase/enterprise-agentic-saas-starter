import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import addonVitest from "@storybook/addon-vitest"
import { definePreview } from "@storybook/react-vite"

import "@fontsource-variable/geist-mono/wght.css"
import "@fontsource-variable/inter/wght.css"
import "../src/styles/globals.css"
import "./preview.css"

export default definePreview({
  addons: [addonA11y(), addonDocs(), addonThemes(), addonVitest()],
  decorators: [
    withThemeByClassName({
      themes: {
        light: "light font-sans antialiased",
        dark: "dark font-sans antialiased",
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
