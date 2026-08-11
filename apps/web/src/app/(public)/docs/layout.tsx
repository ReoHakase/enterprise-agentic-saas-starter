import { NextProvider } from "fumadocs-core/framework/next"
import type { ReactNode } from "react"

import { DocsShell } from "@/components/docs/docs-shell/docs-shell"
import { source } from "@/lib/docs/source"

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <NextProvider>
      <DocsShell tree={source.getPageTree()}>{children}</DocsShell>
    </NextProvider>
  )
}
