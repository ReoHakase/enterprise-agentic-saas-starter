import type { ReactNode } from "react"

import { Icon } from "../icon/icon"
import {
  ZoomableImage,
  type DocsImageSource,
} from "../zoomable-image/zoomable-image"

export const PageHeader = ({
  title,
  description,
  icon,
  lastModified,
  coverImageHeight,
  coverImageSrc,
  coverImageWidth,
}: {
  coverImageHeight?: number
  coverImageSrc?: DocsImageSource
  coverImageWidth?: number
  description?: string
  icon?: string
  lastModified?: Date
  title: ReactNode
}) => (
  <header className="mb-8 border-b pb-8" data-docs-page-header>
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary [&>svg]:size-6"
        data-docs-page-icon
      >
        <Icon icon={icon} />
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
    {coverImageSrc ? (
      <div className="mt-8" data-docs-cover>
        <ZoomableImage
          alt={`${String(title)} cover`}
          className="aspect-2/1 object-cover"
          height={coverImageHeight}
          preload
          staticSrc={coverImageSrc}
          width={coverImageWidth}
        />
      </div>
    ) : null}
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
