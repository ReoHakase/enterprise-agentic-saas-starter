"use client"

import {
  buildFilePreviewUrl,
  FILE_PREVIEW_WIDTHS,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import { useMemo, type ComponentProps } from "react"

import { clientEnv } from "@/lib/env.client"

type PreviewCandidate = {
  requestedWidth: (typeof FILE_PREVIEW_WIDTHS)[number]
  descriptorWidth: number
}

export const getFilePreviewCandidates = (
  imageWidth: number | null
): PreviewCandidate[] => {
  if (!imageWidth || imageWidth <= 0) {
    return FILE_PREVIEW_WIDTHS.map((requestedWidth) => ({
      requestedWidth,
      descriptorWidth: requestedWidth,
    }))
  }

  const candidates: PreviewCandidate[] = []
  for (const requestedWidth of FILE_PREVIEW_WIDTHS) {
    candidates.push({
      requestedWidth,
      descriptorWidth: Math.min(requestedWidth, imageWidth),
    })
    if (requestedWidth >= imageWidth) break
  }
  return candidates
}

export const buildFileImageSourceSet = (
  file: Pick<FileDto, "id" | "imageWidth">,
  organizationId: string,
  baseUrl = clientEnv.NEXT_PUBLIC_API_BASE_URL
) =>
  getFilePreviewCandidates(file.imageWidth)
    .map(
      ({ requestedWidth, descriptorWidth }) =>
        `${buildFilePreviewUrl(baseUrl, {
          organizationId,
          fileId: file.id,
          width: requestedWidth,
        })} ${descriptorWidth.toString()}w`
    )
    .join(", ")

export const AuthenticatedFileImage = ({
  file,
  organizationId,
  sizes,
  alt = file.filename,
  ...props
}: Omit<ComponentProps<"img">, "src" | "srcSet" | "width" | "height"> & {
  file: Pick<FileDto, "id" | "filename" | "imageWidth" | "imageHeight">
  organizationId: string
  sizes: string
}) => {
  const fallbackWidth =
    getFilePreviewCandidates(file.imageWidth)[0]?.requestedWidth ??
    FILE_PREVIEW_WIDTHS[0]
  const src = buildFilePreviewUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
    organizationId,
    fileId: file.id,
    width: fallbackWidth,
  })
  const srcSet = useMemo(
    () => buildFileImageSourceSet(file, organizationId),
    [file, organizationId]
  )

  return (
    // The authenticated source must bypass the Next optimizer because it does
    // not forward the session cookie to the API Worker.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={file.imageWidth ?? undefined}
      height={file.imageHeight ?? undefined}
    />
  )
}
