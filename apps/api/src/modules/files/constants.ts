export const FILE_PREVIEW_WIDTHS = [360, 720, 1200, 2400] as const

export type FilePreviewWidth = (typeof FILE_PREVIEW_WIDTHS)[number]

export const FILE_MAX_BYTES = 20_000_000
export const ORGANIZATION_FILE_QUOTA_BYTES = 1024 * 1024 * 1024
export const FILE_LIST_DEFAULT_LIMIT = 50
export const FILE_LIST_MAX_LIMIT = 100

export const fileOwnerTypes = ["issue"] as const
export type FileOwnerType = (typeof fileOwnerTypes)[number]

export const previewableImageFormats = ["jpeg", "png", "webp", "gif"] as const
export type PreviewableImageFormat = (typeof previewableImageFormats)[number]

export const isFilePreviewWidth = (
  value: string
): value is `${FilePreviewWidth}` =>
  FILE_PREVIEW_WIDTHS.some((width) => String(width) === value)

export const isPreviewableImageFormat = (
  value: string | null
): value is PreviewableImageFormat =>
  previewableImageFormats.some((format) => format === value)

export const fileObjectKey = ({
  fileId,
  organizationId,
  ownerId,
  ownerType,
}: {
  fileId: string
  organizationId: string
  ownerId: string
  ownerType: FileOwnerType
}) =>
  [
    "organizations",
    encodeURIComponent(organizationId),
    "files",
    ownerType,
    encodeURIComponent(ownerId),
    encodeURIComponent(fileId),
  ].join("/")

export const fileOwnerPrefix = ({
  organizationId,
  ownerId,
  ownerType,
}: {
  organizationId: string
  ownerId: string
  ownerType: FileOwnerType
}) =>
  `${[
    "organizations",
    encodeURIComponent(organizationId),
    "files",
    ownerType,
    encodeURIComponent(ownerId),
  ].join("/")}/`
