import {
  buildFilePreviewUrl,
  FILE_PREVIEW_WIDTHS,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"

import { clientEnv } from "@/lib/env"

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
  baseUrl = clientEnv.VITE_API_BASE_URL
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
