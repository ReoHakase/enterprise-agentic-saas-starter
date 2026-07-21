import type {
  ApiClient,
  FileListDto,
  FileOwnerType,
  TextFilePreviewDto,
} from "@enterprise-agentic-saas/api/client"

import { ConsoleApiError, toConsoleApiError } from "@/features/console/api"

export type { FileOwnerType }

type EdenResult<T> = {
  data: T | null | undefined
  error: unknown
  status: number
}

const unwrap = <T>(result: EdenResult<T>): T => {
  if (result.error) {
    throw toConsoleApiError(result.error, result.status)
  }

  if (result.data === null || result.data === undefined) {
    throw new ConsoleApiError({
      code: "invalid_response",
      message: "API response did not include data",
      status: result.status,
    })
  }

  return result.data
}

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
  unwrap(
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
  const result = await client.files
    .organizations({ organizationId: input.organizationId })({
      fileId: input.fileId,
    })
    .delete()
  if (result.error) throw toConsoleApiError(result.error, result.status)
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
  return unwrap(await fileRoutes["text-preview"].get({ fetch: { signal } }))
}
