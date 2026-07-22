export const FILE_PREVIEW_WIDTHS = [360, 720, 1200, 2400] as const

export type FilePreviewWidth = (typeof FILE_PREVIEW_WIDTHS)[number]

export const FILE_MAX_BYTES = 20_000_000
export const ORGANIZATION_FILE_QUOTA_BYTES = 1024 * 1024 * 1024
export const FILE_LIST_DEFAULT_LIMIT = 50
export const FILE_LIST_MAX_LIMIT = 100
export const FILE_TEXT_PREVIEW_MAX_BYTES = 1_000_000

export const AGENT_ASSET_MAX_BYTES = 10_000_000
export const AGENT_ASSET_PENDING_LIFETIME_MS = 60 * 60 * 1000
export const AGENT_ASSET_READY_LIFETIME_MS = 72 * 60 * 60 * 1000
export const AGENT_ASSET_HARD_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
export const AGENT_ASSET_MAX_DIMENSION = 10_000
export const AGENT_ASSET_MAX_PIXELS = 40_000_000
export const AGENT_ASSET_MAX_PENDING_PER_USER = 8
export const AGENT_ASSET_MAX_PENDING_PER_ORGANIZATION = 32
export const AGENT_ASSET_MAX_READY_PER_ORGANIZATION = 200
export const AGENT_RUN_ASSET_MAX_COUNT = 4
export const AGENT_RUN_ASSET_MAX_BYTES = 20_000_000
export const AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT = 60
export const AGENT_ASSET_UPLOAD_ORGANIZATION_DAILY_LIMIT = 1_000
export const AGENT_ASSET_VISION_USER_DAILY_LIMIT = 200
export const AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT = 2_000
export const AGENT_ASSET_MODEL_MAX_EDGE = 2048
export const AGENT_ASSET_MODEL_MAX_BYTES = 4 * 1024 * 1024

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

const textPreviewExtensions = new Set([
  "bash",
  "c",
  "cc",
  "cfg",
  "cjs",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "fish",
  "go",
  "h",
  "hpp",
  "ini",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "kt",
  "kts",
  "less",
  "log",
  "markdown",
  "md",
  "mjs",
  "ndjson",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
])

const excludedTextPreviewExtensions = new Set([
  "htm",
  "html",
  "svg",
  "svgz",
  "xhtml",
])

const excludedTextPreviewContentTypes = new Set([
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
])

const filenameExtension = (filename: string) => {
  const basename = filename.trim().toLowerCase()
  const separator = basename.lastIndexOf(".")
  return separator < 0 ? "" : basename.slice(separator + 1)
}

export const isTextPreviewableFile = (input: {
  declaredContentType: string
  filename: string
}) => {
  const contentType =
    input.declaredContentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  const extension = filenameExtension(input.filename)
  if (
    excludedTextPreviewContentTypes.has(contentType) ||
    excludedTextPreviewExtensions.has(extension)
  ) {
    return false
  }
  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType.endsWith("+json") ||
    textPreviewExtensions.has(extension)
  )
}

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

export const agentAssetObjectKey = ({
  organizationId,
  storageObjectId,
}: {
  organizationId: string
  storageObjectId: string
}) =>
  [
    "organizations",
    encodeURIComponent(organizationId),
    "storage-objects",
    encodeURIComponent(storageObjectId),
  ].join("/")
