import {
  unwrapEdenResult,
  type ApiClient,
  type FileListDto,
  type FileOwnerType,
  type TextFilePreviewDto,
} from "@enterprise-agentic-saas/api/client"

export type { FileOwnerType }

export const listFiles = async (
  client: ApiClient,
  input: {
    organizationId: string
    ownerType: FileOwnerType
    ownerId: string
    cursor?: string
    limit?: number
  },
  signal?: AbortSignal
): Promise<FileListDto> =>
  unwrapEdenResult(
    await client.files
      .organizations({ organizationId: input.organizationId })
      .owners({ ownerType: input.ownerType })({ ownerId: input.ownerId })
      .get({
        query: {
          cursor: input.cursor,
          limit: input.limit ?? 50,
        },
        fetch: { signal },
      })
  )

export const deleteFile = async (
  client: ApiClient,
  input: { organizationId: string; fileId: string }
): Promise<void> => {
  unwrapEdenResult(
    await client.files
      .organizations({ organizationId: input.organizationId })({
        fileId: input.fileId,
      })
      .delete()
  )
}

export const getTextFilePreview = async (
  client: ApiClient,
  input: { organizationId: string; fileId: string },
  signal?: AbortSignal
): Promise<TextFilePreviewDto> => {
  const fileRoutes = client.files.organizations({
    organizationId: input.organizationId,
  })({
    fileId: input.fileId,
  })
  return unwrapEdenResult(
    await fileRoutes["text-preview"].get({ fetch: { signal } })
  )
}
