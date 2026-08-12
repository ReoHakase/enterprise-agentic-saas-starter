"use client"

import { TOCItem, type TOCItemType } from "fumadocs-core/toc"

export const TableOfContents = ({
  toc,
  variant,
}: {
  toc: TOCItemType[]
  variant: "desktop" | "mobile"
}) => {
  if (toc.length === 0) return null

  if (variant === "desktop") {
    return (
      <aside
        aria-label="On This Page"
        className="sticky top-20 hidden max-h-[calc(100svh-6rem)] self-start overflow-y-auto border-l pl-5 lg:block"
        data-docs-toc="desktop"
      >
        <p className="mb-3 text-sm font-semibold text-foreground">
          On This Page
        </p>
        <TOCList toc={toc} />
      </aside>
    )
  }

  return (
    <details
      className="mb-8 rounded-2xl border bg-muted/20 lg:hidden"
      data-docs-toc="mobile"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
        On This Page
      </summary>
      <div className="px-4 pb-4">
        <TOCList toc={toc} />
      </div>
    </details>
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
