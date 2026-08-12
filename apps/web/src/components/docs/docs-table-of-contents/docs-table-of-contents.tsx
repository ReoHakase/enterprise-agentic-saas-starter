"use client"

import { TOCItem, type TOCItemType } from "fumadocs-core/toc"

export const DocsTableOfContents = ({ toc }: { toc: TOCItemType[] }) => {
  if (toc.length === 0) return null

  return (
    <>
      <aside
        aria-label="On This Page"
        className="sticky top-20 hidden max-h-[calc(100svh-6rem)] self-start overflow-y-auto xl:block"
      >
        <p className="mb-3 text-sm font-semibold text-foreground">
          On This Page
        </p>
        <TOCList toc={toc} />
      </aside>
      <details className="rounded-2xl border xl:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
          On This Page
        </summary>
        <div className="px-4 pb-4">
          <TOCList toc={toc} />
        </div>
      </details>
    </>
  )
}

const TOCList = ({ toc }: { toc: TOCItemType[] }) => (
  <ul className="space-y-2 border-l pl-4 text-sm">
    {toc.map((item) => (
      <li key={item.url} className={item.depth > 2 ? "pl-3" : undefined}>
        <TOCItem
          href={item.url}
          className="block text-muted-foreground transition-colors hover:text-foreground data-[active=true]:font-medium data-[active=true]:text-primary"
        >
          {item.title}
        </TOCItem>
      </li>
    ))}
  </ul>
)
