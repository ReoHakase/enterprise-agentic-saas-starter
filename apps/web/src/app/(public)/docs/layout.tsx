import { NextProvider } from "fumadocs-core/framework/next"
import type { ReactNode } from "react"

import { DocsShell } from "@/components/docs/docs-shell/docs-shell"
import { source } from "@/lib/docs/source"

const docsPageTree = source.getPageTree()
const docsSearchPages = source.getPages().map((page) => ({
  icon: page.data.icon,
  title: String(page.data.title),
  url: page.url,
}))

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <NextProvider>
      <DocsShell pages={docsSearchPages} tree={docsPageTree}>
        {children}
      </DocsShell>
    </NextProvider>
  )
}
