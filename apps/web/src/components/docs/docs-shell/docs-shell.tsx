import Link from "fumadocs-core/link"
import type { Root } from "fumadocs-core/page-tree"
import type { ReactNode } from "react"

import { DocsSidebar } from "../docs-sidebar/docs-sidebar"

export const DocsShell = ({
  children,
  tree,
}: {
  children: ReactNode
  tree: Root
}) => (
  <div className="min-h-svh bg-background">
    <header className="border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/docs"
          className="flex min-w-0 items-center gap-3 font-semibold text-foreground"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-sm text-primary-foreground">
            E
          </span>
          <span className="truncate">Enterprise SaaS Documentation</span>
        </Link>
      </div>
    </header>
    <div className="mx-auto flex w-full max-w-7xl items-start px-4 sm:px-6 lg:px-8">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto py-8 pr-8 lg:block">
        <DocsSidebar tree={tree} />
      </aside>
      <main className="min-w-0 flex-1 py-8 lg:pl-8">{children}</main>
    </div>
  </div>
)
