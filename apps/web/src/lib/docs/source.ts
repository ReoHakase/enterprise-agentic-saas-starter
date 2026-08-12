import { loader } from "fumadocs-core/source"
import type {
  MetaData as FumadocsMetaData,
  PageData as FumadocsPageData,
} from "fumadocs-core/source"
import { pageSchema } from "fumadocs-core/source/schema"
import { defineDocs } from "fumadocs-mdx/macro"
import type { MacroDocsCollection } from "fumadocs-mdx/runtime/macro"
import { icons } from "lucide-react"
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
      schema: pageSchema.extend({
        opengraphImage: z.string().optional(),
      }),
    },
  })

const resolveIcon = (icon: string | undefined): ReactNode => {
  if (!icon) return undefined

  const Icon = Object.entries(icons).find(([name]) => name === icon)?.[1]
  return Icon ? createElement(Icon) : icon
}

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon: resolveIcon,
})
