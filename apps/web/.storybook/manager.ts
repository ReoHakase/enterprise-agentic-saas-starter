import { addons } from "storybook/manager-api"
import { themes } from "storybook/theming"

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches

addons.setConfig({
  theme: prefersDark ? themes.dark : themes.light,
})
