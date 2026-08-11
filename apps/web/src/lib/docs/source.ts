import { loader } from "fumadocs-core/source"
import type { PageData as FumadocsPageData } from "fumadocs-core/source"
import { defineDocs } from "fumadocs-mdx/macro"
import type { MacroDocsCollection } from "fumadocs-mdx/runtime/macro"

const docs: MacroDocsCollection<FumadocsPageData> = defineDocs({
  dir: "content/docs",
})

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
})
