import FumaLink from "fumadocs-core/link"
import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { DocsIcon } from "../docs-icon/docs-icon"

export type DocsBreadcrumbItem = {
  icon?: string
  name: ReactNode
  url?: string
}

export const DocsBreadcrumb = ({ items }: { items: DocsBreadcrumbItem[] }) => (
  <nav
    aria-label="Breadcrumb"
    className="mb-8 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
    data-docs-breadcrumb
  >
    {items.map((item, index) => (
      <span
        key={item.url ?? String(item.name)}
        className="flex items-center gap-1"
      >
        {index > 0 ? (
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        ) : null}
        {item.url ? (
          <FumaLink
            href={item.url}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:text-foreground"
          >
            <DocsIcon icon={item.icon} className="size-3.5" />
            <span>{item.name}</span>
          </FumaLink>
        ) : (
          <span className="flex items-center gap-1.5 px-1 py-0.5 text-foreground">
            <DocsIcon icon={item.icon} className="size-3.5" />
            <span>{item.name}</span>
          </span>
        )}
      </span>
    ))}
  </nav>
)
