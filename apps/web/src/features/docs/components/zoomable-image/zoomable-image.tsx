"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@enterprise-agentic-saas/ui/components/dialog"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { Image } from "@unpic/react"
import { ZoomInIcon } from "lucide-react"
import type { ComponentProps } from "react"

type StaticImageData = {
  height?: number
  src: string
  width?: number
}

export type DocsImageSource =
  | string
  | StaticImageData
  | { default: StaticImageData }

const zoomTriggerRender = (
  <button
    type="button"
    aria-label="Zoom documentation image"
    className="group relative my-6 block w-full overflow-hidden rounded-2xl border bg-muted text-left shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
    data-docs-zoom-trigger
  />
)

export const ZoomableImage = ({
  alt = "",
  className,
  height,
  loading = "lazy",
  preload,
  src,
  staticSrc,
  title,
  width,
}: ComponentProps<"img"> & {
  preload?: boolean
  staticSrc?: DocsImageSource
}) => {
  const imageSrc = staticSrc ?? src
  if (!isImageSource(imageSrc)) return null

  const imageUrl = getImageUrl(imageSrc)
  const label = alt ? `Zoom image: ${alt}` : "Zoom documentation image"
  const imageHeight = resolveDimension(
    height,
    getIntrinsicHeight(imageSrc) ?? 900
  )
  const imageWidth = resolveDimension(
    width,
    getIntrinsicWidth(imageSrc) ?? 1600
  )

  return (
    <Dialog>
      <DialogTrigger render={zoomTriggerRender} aria-label={label}>
        <Image
          alt={alt}
          className={cn(
            "block h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]",
            className
          )}
          fetchPriority={preload ? "high" : undefined}
          height={imageHeight}
          loading={preload ? "eager" : loading}
          src={imageUrl}
          title={title}
          width={imageWidth}
        />
        <span className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur">
          <ZoomInIcon aria-hidden="true" className="size-4" />
        </span>
      </DialogTrigger>
      <DialogContent
        className="block max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-auto bg-background/95 p-2 sm:max-w-6xl"
        data-docs-zoom-dialog
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          Expanded documentation image. Press Escape to close.
        </DialogDescription>
        <Image
          alt={alt}
          className="mx-auto block max-h-[calc(100svh-3rem)] w-auto rounded-2xl object-contain"
          height={imageHeight}
          src={imageUrl}
          title={title}
          width={imageWidth}
        />
      </DialogContent>
    </Dialog>
  )
}

const isImageSource = (value: unknown): value is DocsImageSource =>
  typeof value === "string" ||
  (typeof value === "object" &&
    value !== null &&
    ("src" in value || "default" in value))

const getStaticImageData = (src: DocsImageSource) => {
  if (typeof src === "string") return undefined
  if ("default" in src) return src.default
  return src
}

const getImageUrl = (src: DocsImageSource): string =>
  typeof src === "string" ? src : (getStaticImageData(src)?.src ?? "")

const getIntrinsicHeight = (src: DocsImageSource): number | undefined =>
  getStaticImageData(src)?.height

const getIntrinsicWidth = (src: DocsImageSource): number | undefined =>
  getStaticImageData(src)?.width

const resolveDimension = (
  value: number | string | undefined,
  fallback: number
): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}
