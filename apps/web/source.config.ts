import { pageSchema } from "fumadocs-core/source/schema"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"
import { z } from "zod"

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    async: true,
    lastModified: true,
    postprocess: {
      includeProcessedMarkdown: true,
    },
    schema: pageSchema.extend({
      opengraphImage: z.string().optional(),
    }),
  },
})

export default defineConfig({
  mdxOptions: {
    remarkCodeTabOptions: {
      Tabs: "Tabs",
      parseMdx: true,
    },
  },
})
