import { loader } from "fumadocs-core/source"
import type {
  MetaData as FumadocsMetaData,
  PageData as FumadocsPageData,
} from "fumadocs-core/source"
import { lucideIconsPlugin } from "fumadocs-core/source/plugins/lucide-icons"
import { pageSchema } from "fumadocs-core/source/schema"
import { defineDocs } from "fumadocs-mdx/macro"
import type { MacroDocsCollection } from "fumadocs-mdx/runtime/macro"
import { createElement, type ReactNode } from "react"
import { z } from "zod"

type DocsPageData = FumadocsPageData & {
  opengraphImage?: string
}

type DocsExtras = {
  extractedReferences?: { href: string }[]
  lastModified?: Date
}

const docs: MacroDocsCollection<DocsPageData, FumadocsMetaData, DocsExtras> =
  defineDocs({
    dir: "content/docs",
    docs: {
      lastModified: true,
      postprocess: {
        includeProcessedMarkdown: true,
      },
      schema: pageSchema.extend({
        opengraphImage: z.string().optional(),
      }),
    },
  })

const emojiPattern = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u

const resolveEmojiIcon = (icon: string | undefined): ReactNode =>
  icon && emojiPattern.test(icon)
    ? createElement("span", { "aria-hidden": true }, icon)
    : undefined

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon: resolveEmojiIcon,
  plugins: [lucideIconsPlugin()],
})
