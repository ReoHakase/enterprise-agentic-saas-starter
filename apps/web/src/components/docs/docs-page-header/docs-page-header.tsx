import type { ReactNode } from "react"

import { DocsIcon } from "../docs-icon/docs-icon"

export const DocsPageHeader = ({
  title,
  description,
  icon,
  lastModified,
}: {
  description?: string
  icon?: string
  lastModified?: Date
  title: ReactNode
}) => (
  <header className="mb-10 border-b pb-8" data-docs-page-header>
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary [&>svg]:size-6"
        data-docs-page-icon
      >
        <DocsIcon icon={icon} />
      </span>
      <div className="min-w-0">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 text-lg text-muted-foreground">{description}</p>
        ) : null}
        {lastModified ? (
          <p
            className="mt-5 text-sm text-muted-foreground"
            data-doc-last-updated
          >
            Last updated {formatLastModified(lastModified)}
          </p>
        ) : null}
      </div>
    </div>
  </header>
)

const lastModifiedFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
})

const formatLastModified = (date: Date): string =>
  lastModifiedFormatter.format(date)
