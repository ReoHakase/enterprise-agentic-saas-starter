"use client"

import {
  buildFilePreviewUrl,
  FILE_PREVIEW_WIDTHS,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import { useMemo, type ComponentProps } from "react"

import { clientEnv } from "@/lib/env.client"

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
    // oxlint-disable react-doctor/nextjs-no-img-element
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
    // oxlint-enable react-doctor/nextjs-no-img-element
  )
}
