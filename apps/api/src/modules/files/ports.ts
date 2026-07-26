import type { OrganizationRole } from "../authorization/public"
import type { AgentAssetWithStorage } from "./agent-assets-domain"
import type { FileOwnerType, PreviewableImageFormat } from "./constants"
import type { FileWithOwner } from "./file-domain"
import type { AgentAssetDto, FileDto, FileListDto } from "./model"
import type { FileStorageRuntime } from "./runtime"

type FileOwnerAccessInput = {
  actorUserId: string
  organizationId: string
  ownerId: string
  ownerType: FileOwnerType
}

type ReadyFile = {
  dto: FileDto
  stored: FileWithOwner
}

type FindReadyFileInput = {
  actorRole: OrganizationRole
  actorUserId: string
  fileId: string
  organizationId: string
}

export type FileServicePorts = {
  assertOwnerUploadable(input: FileOwnerAccessInput): Promise<void>
  finalizePendingFile(input: {
    actorUserId: string
    etag: string
    file: FileWithOwner
    imageHeight: null | number
    imageWidth: null | number
  }): Promise<void>
  findReadyFileById(input: FindReadyFileInput): Promise<ReadyFile | null>
  getRuntime(): FileStorageRuntime
  reservePendingFile(input: {
    declaredContentType: string
    detectedImageFormat: PreviewableImageFormat | "avif" | null
    fileId: string
    filename: string
    objectKey: string
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
    sizeBytes: number
    uploaderId: string
    uploadId: string
  }): Promise<{ created: boolean; file: FileWithOwner }>
}

export type FileReadPorts = {
  assertOwnerReadable(input: FileOwnerAccessInput): Promise<void>
  deleteReadyFile(input: {
    actorUserId: string
    file: FileWithOwner
  }): Promise<boolean>
  findReadyFileById(input: FindReadyFileInput): Promise<ReadyFile | null>
  getRuntime(): FileStorageRuntime
  listReadyFilesByOwner(input: {
    actorRole: OrganizationRole
    actorUserId: string
    cursor?: string
    limit: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
  }): Promise<FileListDto>
}

export type AgentAssetServicePorts = {
  detectImageFormat(file: Blob): Promise<PreviewableImageFormat | "avif" | null>
  discardPendingAgentAsset(input: {
    assetId: string
    expectedClaimRevision: number
    expectedStorageCleanupRevision: number
    organizationId: string
  }): Promise<unknown>
  finalizePendingAgentAsset(input: {
    assetId: string
    etag: string
    imageHeight: number
    imageWidth: number
    organizationId: string
  }): Promise<AgentAssetWithStorage>
  findReadyAgentAssetForSession(input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
  }): Promise<AgentAssetWithStorage>
  getRuntime(): FileStorageRuntime
  reservePendingAgentAsset(input: {
    assetId: string
    declaredContentType: string
    detectedImageFormat: PreviewableImageFormat
    filename: string
    objectKey: string
    organizationId: string
    sessionId: string
    sizeBytes: number
    storageObjectId: string
    threadId: string
    uploadId: string
    uploaderId: string
  }): Promise<{ created: boolean; value: AgentAssetWithStorage }>
  toAgentAssetDto(value: AgentAssetWithStorage): AgentAssetDto
}

export type AgentAssetPreviewPorts = {
  deleteReadyAgentAsset(input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
  }): Promise<boolean>
  findAgentRunAssetForModel(input: {
    assetId: string
    grant: string
  }): Promise<AgentAssetWithStorage>
  findPreviewableAgentAssetForSession(input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
  }): Promise<AgentAssetWithStorage>
  getRuntime(): FileStorageRuntime
}

export type AgentIssueAttachmentPorts = {
  findIssueAttachmentForModel(input: {
    fileId: string
    grant: string
    issueId: string
  }): Promise<{
    etag: null | string
    objectKey: string
  }>
  getRuntime(): FileStorageRuntime
}
