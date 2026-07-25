import { AppError, publicErrors } from "../../errors/app-error"
import type { AgentAssetDto } from "./model"

export type AgentAssetWithStorage = {
  asset: {
    contextEpoch: number
    createdAt: Date
    expiresAt: Date
    filename: string
    id: string
    organizationId: string
    promotedFileId: null | string
    sessionId: null | string
    status:
      | "deleted"
      | "expired"
      | "pending"
      | "promoted"
      | "promoting"
      | "ready"
    threadId: string
    uploaderId: string
  }
  claim: {
    holderId: null | string
    holderType: string
    organizationId: string
    revision: number
    storageObjectId: string
  } | null
  storage: {
    cleanupRevision: number
    declaredContentType: string
    detectedImageFormat: null | string
    etag: null | string
    id: string
    imageHeight: null | number
    imageWidth: null | number
    objectKey: null | string
    organizationId: string
    sizeBytes: number
    status: "deleted" | "deleting" | "pending" | "ready"
    uploaderId: string
    uploadId: string
  }
}

export const preserveAgentAssetError = (
  cause: unknown,
  operation: string
): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, {
    module: "agent-assets",
    operation,
  })
}

const errorDiagnostic = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return messages.join(" ")
}

export const isUploadIdUniqueConflict = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("storage_objects_organization_upload_uidx") ||
    diagnostic.includes(
      "storage_objects.organization_id, storage_objects.upload_id"
    )
  )
}

export const isDatabaseWriteContention = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("SQLITE_BUSY") || diagnostic.includes("SQLITE_LOCKED")
  )
}

export const assetNotFound = () =>
  publicErrors.notFound("Agent asset not found", { resource: "agent_asset" })

export const assetConflict = (reason: string) =>
  publicErrors.conflict("Agent asset changed", {
    reason,
    resource: "agent_asset",
  })

export const quotaExceeded = () =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Organization image quota exceeded",
    publicContext: {
      constraint: "organization_storage_bytes",
      reason: "quota_exceeded",
      resource: "agent_asset",
      retryAfter: 60,
    },
  })

export const agentAssetLimitExceeded = (constraint: string) =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Too many temporary images. Try again later",
    publicContext: {
      constraint,
      reason: "quota_exceeded",
      resource: "agent_asset",
      retryAfter: 60,
    },
  })

export const assertAgentAssetClaim = (value: AgentAssetWithStorage) => {
  if (
    !value.claim ||
    value.claim.organizationId !== value.asset.organizationId ||
    value.claim.storageObjectId !== value.storage.id ||
    value.claim.holderType !== "agent_asset" ||
    value.claim.holderId !== value.asset.id
  ) {
    throw assetConflict("claim_mismatch")
  }
}

export const assertPromotedAgentAssetClaim = (value: AgentAssetWithStorage) => {
  if (
    !value.claim ||
    !value.asset.promotedFileId ||
    value.claim.organizationId !== value.asset.organizationId ||
    value.claim.storageObjectId !== value.storage.id ||
    value.claim.holderType !== "file" ||
    value.claim.holderId !== value.asset.promotedFileId
  ) {
    throw assetConflict("claim_mismatch")
  }
}

export const toAgentAssetDto = (
  value: AgentAssetWithStorage
): AgentAssetDto => {
  if (
    value.asset.status !== "ready" ||
    value.storage.status !== "ready" ||
    !value.storage.imageWidth ||
    !value.storage.imageHeight
  ) {
    throw new Error("Agent asset DTO requires a ready image")
  }
  return {
    id: value.asset.id,
    filename: value.asset.filename,
    sizeBytes: value.storage.sizeBytes,
    imageWidth: value.storage.imageWidth,
    imageHeight: value.storage.imageHeight,
    previewable: true,
    expiresAt: value.asset.expiresAt.toISOString(),
  }
}
