import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import {
  infiniteQueryOptions,
  type QueryFunctionContext,
} from "@tanstack/react-query"

import { listFiles, type FileOwnerType } from "@/features/files/api"

export const fileKeys = {
  all: ["files"] as const,
  owners: () => [...fileKeys.all, "owners"] as const,
  owner: (organizationId: string, ownerType: FileOwnerType, ownerId: string) =>
    [...fileKeys.owners(), organizationId, ownerType, ownerId] as const,
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
