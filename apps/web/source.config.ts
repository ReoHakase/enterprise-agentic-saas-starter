import { defineConfig } from "fumadocs-mdx/config"

export default defineConfig({
  mdxOptions: {
    remarkCodeTabOptions: {
      Tabs: "Tabs",
      parseMdx: true,
    },
  },
})
