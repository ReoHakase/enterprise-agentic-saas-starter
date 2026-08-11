"use client"

import { TOCItem, type TOCItemType } from "fumadocs-core/toc"

export const DocsTableOfContents = ({ toc }: { toc: TOCItemType[] }) => {
  if (toc.length === 0) return null

  return (
    <aside aria-label="On this page" className="hidden xl:block">
      <p className="mb-3 text-sm font-semibold text-foreground">On this page</p>
      <ul className="space-y-2 border-l pl-4 text-sm">
        {toc.map((item) => (
          <li key={item.url} className={item.depth > 2 ? "pl-3" : undefined}>
            <TOCItem
              href={item.url}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.title}
            </TOCItem>
          </li>
        ))}
      </ul>
    </aside>
  )
}
