import {
  FileUploadError,
  type AgentAssetDto,
} from "@enterprise-agentic-saas/api/client"
import { atom } from "jotai"

import type { PendingChatSubmission } from "../../submission-identity"

export type StagedAgentAsset = {
  asset: AgentAssetDto
  file: File
  blobUrl: string
}

export type AgentThreadDraft = {
  composer: string
  stagedAssets: StagedAgentAsset[]
  uploadingCount: number
  pendingSubmission?: PendingChatSubmission
}

export type AgentDraftScopes = Record<string, Record<string, AgentThreadDraft>>

export const threadDraftsAtom = atom<AgentDraftScopes>({})
export const emptyThreadDraft: AgentThreadDraft = {
  composer: "",
  stagedAssets: [],
  uploadingCount: 0,
}

export const draftScopeKey = (userId: string, organizationId: string) =>
  JSON.stringify([userId, organizationId])

export type AgentSessionLifecycle = {
  abortTransport: () => void
  close: () => void
  stop: () => Promise<boolean>
  isBusy: () => boolean
  hasPendingApprovals: () => boolean
}

export type RegisteredAgentSession = AgentSessionLifecycle & {
  threadId: string
}

export type RegisteredUpload = {
  threadId: string
  generation: number
  sizeBytes: number
}

export type OrganizationSwitchRisks = {
  composer: boolean
  uploads: boolean
  stagedAssets: boolean
  activeTurn: boolean
  pendingApprovals: boolean
  dirtyIssueForms: boolean
}

export type AgentThreadSwitchRisks = Omit<
  OrganizationSwitchRisks,
  "dirtyIssueForms"
>

export type CompleteThreadSwitchOptions = {
  discardDraft: boolean
}

export type AgentRuntimeState = {
  userId: string
  organizationId: string
  frozen: boolean
  getThreadDraft: (threadId: string) => AgentThreadDraft
  setThreadComposer: (threadId: string, value: string) => void
  setThreadPendingSubmission: (
    threadId: string,
    submission: PendingChatSubmission | undefined
  ) => void
  uploadImages: (threadId: string, files: File[]) => Promise<void>
  removeStagedAsset: (threadId: string, assetId: string) => Promise<void>
  clearStagedAssetsAfterSend: (threadId: string) => void
  registerSession: (
    threadId: string,
    lifecycle: AgentSessionLifecycle
  ) => () => void
  beginThreadSwitch: (threadId: string) => AgentThreadSwitchRisks
  cancelThreadSwitch: () => void
  completeThreadSwitch: (
    threadId: string,
    options: CompleteThreadSwitchOptions
  ) => Promise<void>
  beginOrganizationSwitch: () => OrganizationSwitchRisks
  cancelOrganizationSwitch: () => void
  abortOrganizationSwitch: () => void
  completeOrganizationSwitch: () => Promise<void>
}

export type AgentThreadRuntimeState = {
  frozen: boolean
  composer: string
  setComposer: (value: string) => void
  pendingSubmission?: PendingChatSubmission
  setPendingSubmission: (submission: PendingChatSubmission | undefined) => void
  stagedAssets: StagedAgentAsset[]
  uploadingCount: number
  uploadImages: (files: File[]) => Promise<void>
  removeStagedAsset: (assetId: string) => Promise<void>
  clearStagedAssetsAfterSend: () => void
  registerSession: (lifecycle: AgentSessionLifecycle) => () => void
}

export const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
export const maximumImageBytes = 10_000_000
export const maximumImagesTotalBytes = 20_000_000
export const maximumImagesPerMessage = 4

export const getAgentImageUploadErrorText = (error: unknown): string => {
  if (!(error instanceof FileUploadError)) return "Image upload failed."
  if (error.code === "feature_not_enabled") {
    return "Image attachments are disabled in this environment. Enable Agent image uploads and try again."
  }
  if (error.status === 503 || error.status === 0) {
    return "The image upload service is temporarily unavailable. Try again after the API is ready."
  }
  const message = error.message.trim()
  return message.length > 0 && message.length <= 500
    ? message
    : "Image upload failed."
}
