import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import {
  infiniteQueryOptions,
  queryOptions,
  type QueryFunctionContext,
} from "@tanstack/react-query"

import { getTextFilePreview, listFiles, type FileOwnerType } from "./api"

export const fileKeys = {
  all: ["files"] as const,
  owners: () => [...fileKeys.all, "owners"] as const,
  owner: (organizationId: string, ownerType: FileOwnerType, ownerId: string) =>
    [...fileKeys.owners(), organizationId, ownerType, ownerId] as const,
  textPreviews: () => [...fileKeys.all, "text-previews"] as const,
  textPreview: (organizationId: string, fileId: string) =>
    [...fileKeys.textPreviews(), organizationId, fileId] as const,
}

const createFilesQueryFn =
  (
    client: ApiClient,
    organizationId: string,
    ownerType: FileOwnerType,
    ownerId: string
  ) =>
  ({ signal, pageParam }: QueryFunctionContext) =>
    listFiles(
      client,
      {
        organizationId,
        ownerType,
        ownerId,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: 50,
      },
      signal
    )

const createTextFilePreviewQueryFn =
  (client: ApiClient, organizationId: string, fileId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getTextFilePreview(client, { organizationId, fileId }, signal)

export const filesQueryOptions = (
  client: ApiClient,
  organizationId: string,
  ownerType: FileOwnerType,
  ownerId: string
) =>
  infiniteQueryOptions({
    queryKey: fileKeys.owner(organizationId, ownerType, ownerId),
    queryFn: createFilesQueryFn(client, organizationId, ownerType, ownerId),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:
      organizationId.length > 0 && ownerType.length > 0 && ownerId.length > 0,
  })

export const textFilePreviewQueryOptions = (
  client: ApiClient,
  organizationId: string,
  fileId: string
) =>
  queryOptions({
    queryKey: fileKeys.textPreview(organizationId, fileId),
    queryFn: createTextFilePreviewQueryFn(client, organizationId, fileId),
    enabled: organizationId.length > 0 && fileId.length > 0,
    gcTime: 0,
  })
