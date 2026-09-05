"use client"

import {
  buildFilePreviewUrl,
  FILE_PREVIEW_WIDTHS,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import { useMemo, type ComponentProps } from "react"

import { clientEnv } from "@/lib/env"

import {
  buildFileImageSourceSet,
  getFilePreviewCandidates,
} from "../authenticated-file-image-source/authenticated-file-image-source"

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
  const src = buildFilePreviewUrl(clientEnv.VITE_API_BASE_URL, {
    organizationId,
    fileId: file.id,
    width: fallbackWidth,
  })
  const srcSet = useMemo(
    () => buildFileImageSourceSet(file, organizationId),
    [file, organizationId]
  )

  return (
    // The authenticated source must bypass external image transformation because
    // it must forward the session cookie directly to the API Worker.
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
