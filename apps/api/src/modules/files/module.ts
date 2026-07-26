import type { Db } from "@enterprise-agentic-saas/db"

import type {
  AccessControlFactory,
  AuthorizationService,
} from "../authorization/public"
import { toAgentAssetDto } from "./agent-assets-domain"
import { createAgentAssetPreviewService } from "./agent-assets-preview-service"
import {
  deleteReadyAgentAsset,
  discardPendingAgentAsset,
  finalizePendingAgentAsset,
  findAgentRunAssetForModel,
  findPreviewableAgentAssetForSession,
  findReadyAgentAssetForSession,
  reservePendingAgentAsset,
} from "./agent-assets-repository"
import { getAgentAssetRuntime } from "./agent-assets-runtime"
import { createAgentAssetService } from "./agent-assets-service"
import { findIssueAttachmentForModel } from "./agent-issue-attachments-repository"
import { createAgentIssueAttachmentService } from "./agent-issue-attachments-service"
import { detectImageFormat } from "./file-domain"
import { getFileOwnerAdapter } from "./owner-adapters"
import { createFileReadService } from "./read-service"
import {
  deleteReadyFile,
  finalizePendingFile,
  findReadyFileById,
  listReadyFilesByOwner,
  reservePendingFile,
} from "./repository"
import { createFilesRoutes } from "./routes"
import { createFileService } from "./service"
import { getRuntime } from "./service-runtime"

export const createFilesInternalApplication = (db: Db) => {
  const agentAssetPreviewService = createAgentAssetPreviewService({
    deleteReadyAgentAsset: (input) => deleteReadyAgentAsset(db, input),
    findAgentRunAssetForModel: (input) => findAgentRunAssetForModel(db, input),
    findPreviewableAgentAssetForSession: (input) =>
      findPreviewableAgentAssetForSession(db, input),
    getRuntime: getAgentAssetRuntime,
  })
  const agentIssueAttachmentService = createAgentIssueAttachmentService({
    findIssueAttachmentForModel: (input) =>
      findIssueAttachmentForModel(db, input),
    getRuntime,
  })
  return { ...agentAssetPreviewService, ...agentIssueAttachmentService }
}

/** @internal */
export const createFileReconciliationApplication = (db: Db) => {
  const service = createFileService({
    assertOwnerUploadable: async (input) => {
      await getFileOwnerAdapter(input.ownerType).assertExists(db, input)
    },
    finalizePendingFile: (input) => finalizePendingFile(db, input),
    findReadyFileById: (input) => findReadyFileById(db, input),
    getRuntime,
    reservePendingFile: (input) => reservePendingFile(db, input),
  })
  return { reconcilePendingUpload: service.reconcilePendingUpload }
}

/** @internal */
export const createFilesApplication = (
  db: Db,
  authorization: AuthorizationService
) => {
  const assertOwnerAccess = async (input: {
    actorUserId: string
    organizationId: string
    ownerId: string
    ownerType: "issue"
  }) => {
    await authorization.requireMembership({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    })
    await getFileOwnerAdapter(input.ownerType).assertExists(db, input)
  }

  const fileService = createFileService({
    assertOwnerUploadable: assertOwnerAccess,
    finalizePendingFile: (input) => finalizePendingFile(db, input),
    findReadyFileById: (input) => findReadyFileById(db, input),
    getRuntime,
    reservePendingFile: (input) => reservePendingFile(db, input),
  })

  const readService = createFileReadService({
    assertOwnerReadable: assertOwnerAccess,
    deleteReadyFile: (input) => deleteReadyFile(db, input),
    findReadyFileById: (input) => findReadyFileById(db, input),
    getRuntime,
    listReadyFilesByOwner: (input) => listReadyFilesByOwner(db, input),
  })

  const agentAssetService = createAgentAssetService({
    detectImageFormat,
    discardPendingAgentAsset: (input) => discardPendingAgentAsset(db, input),
    finalizePendingAgentAsset: (input) => finalizePendingAgentAsset(db, input),
    findReadyAgentAssetForSession: (input) =>
      findReadyAgentAssetForSession(db, input),
    getRuntime: getAgentAssetRuntime,
    reservePendingAgentAsset: (input) => reservePendingAgentAsset(db, input),
    toAgentAssetDto,
  })

  const internalService = createFilesInternalApplication(db)

  return {
    ...internalService,
    ...agentAssetService,
    ...fileService,
    ...readService,
  }
}

export const createFilesModule = (
  db: Db,
  authorization: AuthorizationService,
  createAccessControl: AccessControlFactory
) =>
  createFilesRoutes(
    createFilesApplication(db, authorization),
    createAccessControl
  )
