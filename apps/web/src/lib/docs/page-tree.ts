import type { Node } from "fumadocs-core/page-tree"
import type { ReactNode } from "react"

export const collectPageIcons = (nodes: Node[]): Map<string, ReactNode> => {
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
