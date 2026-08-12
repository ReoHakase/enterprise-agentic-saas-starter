import { NextProvider } from "fumadocs-core/framework/next"
import type { Node } from "fumadocs-core/page-tree"
import type { ReactNode } from "react"

import { Shell } from "@/features/docs"
import { source } from "@/lib/docs/source"

const collectPageIcons = (nodes: Node[]): Map<string, ReactNode> => {
  const icons = new Map<string, ReactNode>()

  for (const node of nodes) {
    if (node.type === "page") {
      icons.set(node.url, node.icon)
      continue
    }

    if (node.type === "folder") {
      if (node.index) icons.set(node.index.url, node.index.icon ?? node.icon)
      for (const [url, icon] of collectPageIcons(node.children)) {
        icons.set(url, icon)
      }
    }
  }

  return icons
}

const docsPageTree = source.getPageTree()
const docsPageIcons = collectPageIcons(docsPageTree.children)
const docsSearchPages = source.getPages().map((page) => ({
  icon: docsPageIcons.get(page.url),
  title: String(page.data.title),
  url: page.url,
}))

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <NextProvider>
      <Shell pages={docsSearchPages} tree={docsPageTree}>
        {children}
      </Shell>
    </NextProvider>
  )
}
