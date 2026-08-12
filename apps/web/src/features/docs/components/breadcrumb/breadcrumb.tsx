import FumaLink from "fumadocs-core/link"
import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Icon } from "../icon/icon"

export type BreadcrumbItem = {
  icon?: string
  name: ReactNode
  url?: string
}

export const Breadcrumb = ({ items }: { items: BreadcrumbItem[] }) => (
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
            <Icon icon={item.icon} className="size-3.5" />
            <span>{item.name}</span>
          </FumaLink>
        ) : (
          <span className="flex items-center gap-1.5 px-1 py-0.5 text-foreground">
            <Icon icon={item.icon} className="size-3.5" />
            <span>{item.name}</span>
          </span>
        )}
      </span>
    ))}
  </nav>
)
