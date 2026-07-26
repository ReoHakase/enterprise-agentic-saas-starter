import {
  agentActionAssets,
  agentActions,
  agentAssets,
  agentRunAssets,
  auditLogs,
  files,
  issueFileOwners,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, isNull, sql } from "drizzle-orm"

import { assetConflict } from "./agent-assets-domain"
import type { AgentAssetTransaction } from "./agent-assets-repository-support"
import { getFileOwnerAdapter } from "./owner-adapters"

type AgentAssetPromotionInput = {
  actionId: string
  actorUserId: string
  assetId: string
  issueId: string
  now: Date
  organizationId: string
  plannedFileId: string
}

type AgentAssetPromotionResult = {
  assetId: string
  fileId: string
  sizeBytes: number
  storageObjectId: string
}

const selectPromotionSource = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput
) => {
  const rows = await tx
    .select({
      actionRunId: agentActions.runId,
      actionThreadId: agentActions.threadId,
      actionSessionId: agentActions.sessionId,
      actionUserId: agentActions.userId,
      actionContextEpoch: agentActions.contextEpoch,
      actionAssetStorageObjectId: agentActionAssets.storageObjectId,
      actionAssetSourceEtag: agentActionAssets.sourceEtag,
      actionAssetSizeBytes: agentActionAssets.sizeBytes,
      actionAssetLeaseExpiresAt: agentActionAssets.leaseExpiresAt,
      actionAssetReleasedAt: agentActionAssets.releasedAt,
      actionAssetQuotaClassifiedAt: agentActionAssets.quotaClassifiedAt,
      asset: agentAssets,
      storage: storageObjects,
      claim: storageObjectClaims,
      runAssetStorageObjectId: agentRunAssets.storageObjectId,
      runAssetSourceEtag: agentRunAssets.sourceEtag,
      runAssetSizeBytes: agentRunAssets.sizeBytes,
    })
    .from(agentActions)
    .innerJoin(
      agentActionAssets,
      and(
        eq(agentActionAssets.organizationId, agentActions.organizationId),
        eq(agentActionAssets.actionId, agentActions.id),
        eq(agentActionAssets.assetId, input.assetId)
      )
    )
    .innerJoin(
      agentRunAssets,
      and(
        eq(agentRunAssets.organizationId, agentActions.organizationId),
        eq(agentRunAssets.runId, agentActions.runId),
        eq(agentRunAssets.assetId, agentActionAssets.assetId)
      )
    )
    .innerJoin(
      agentAssets,
      and(
        eq(agentAssets.organizationId, agentActionAssets.organizationId),
        eq(agentAssets.id, agentActionAssets.assetId)
      )
    )
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentActionAssets.organizationId),
        eq(storageObjects.id, agentActionAssets.storageObjectId)
      )
    )
    .innerJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id)
      )
    )
    .where(
      and(
        eq(agentActions.id, input.actionId),
        eq(agentActions.organizationId, input.organizationId),
        eq(agentActions.kind, "create_issue"),
        eq(agentActions.status, "approved"),
        eq(agentActions.targetId, input.issueId),
        eq(agentActions.userId, input.actorUserId),
        gt(agentActions.expiresAt, input.now)
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row) {
    throw assetConflict("promotion_precondition_changed")
  }
  const objectKey = row.storage.objectKey
  const etag = row.storage.etag
  const preconditions = [
    row.actionAssetReleasedAt === null,
    row.actionAssetQuotaClassifiedAt === null,
    row.actionAssetLeaseExpiresAt.getTime() > input.now.getTime(),
    row.actionAssetStorageObjectId === row.storage.id,
    row.actionAssetSourceEtag === etag,
    row.actionAssetSizeBytes === row.storage.sizeBytes,
    row.runAssetStorageObjectId === row.storage.id,
    row.runAssetSourceEtag === etag,
    row.runAssetSizeBytes === row.storage.sizeBytes,
    row.asset.status === "ready",
    row.asset.expiresAt.getTime() > input.now.getTime(),
    row.asset.storageObjectId === row.storage.id,
    row.asset.organizationId === input.organizationId,
    row.asset.threadId === row.actionThreadId,
    row.asset.sessionId === row.actionSessionId,
    row.asset.uploaderId === row.actionUserId,
    row.asset.contextEpoch === row.actionContextEpoch,
    row.storage.status === "ready",
    Boolean(objectKey),
    Boolean(etag),
    row.claim.holderType === "agent_asset",
    row.claim.holderId === row.asset.id,
  ]
  if (preconditions.includes(false) || !objectKey || !etag) {
    throw assetConflict("promotion_precondition_changed")
  }
  return {
    ...row,
    storage: {
      ...row.storage,
      objectKey,
      etag,
    },
  }
}

type PromotionSource = Awaited<ReturnType<typeof selectPromotionSource>>

const createPendingIssueFile = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput,
  row: PromotionSource
) => {
  const fileRows = await tx
    .insert(files)
    .values({
      id: input.plannedFileId,
      organizationId: input.organizationId,
      uploaderId: row.asset.uploaderId,
      uploadId: `agent:${input.actionId}:${input.assetId}`,
      ownerType: "issue",
      objectKey: row.storage.objectKey,
      filename: row.asset.filename,
      sizeBytes: row.storage.sizeBytes,
      declaredContentType: row.storage.declaredContentType,
      detectedImageFormat: row.storage.detectedImageFormat,
      imageWidth: row.storage.imageWidth,
      imageHeight: row.storage.imageHeight,
      etag: row.storage.etag,
      status: "pending",
      storageObjectId: row.storage.id,
      keyVersion: row.storage.keyVersion,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: files.id })
  if (!fileRows[0]) throw new Error("Promoted file insert returned no row")
  await tx.insert(issueFileOwners).values({
    fileId: input.plannedFileId,
    organizationId: input.organizationId,
    ownerType: "issue",
    issueId: input.issueId,
  })
}

const transferPromotionClaim = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput,
  row: PromotionSource
) => {
  const promotingRows = await tx
    .update(agentAssets)
    .set({ status: "promoting", updatedAt: input.now })
    .where(
      and(
        eq(agentAssets.id, row.asset.id),
        eq(agentAssets.organizationId, input.organizationId),
        eq(agentAssets.status, "ready"),
        eq(agentAssets.storageObjectId, row.storage.id),
        gt(agentAssets.expiresAt, input.now)
      )
    )
    .returning({ id: agentAssets.id })
  if (!promotingRows[0]) throw assetConflict("promotion_race")

  const transferringRows = await tx
    .update(storageObjectClaims)
    .set({
      holderType: "transferring",
      holderId: null,
      fromAssetId: row.asset.id,
      toFileId: input.plannedFileId,
      revision: sql`${storageObjectClaims.revision} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(storageObjectClaims.storageObjectId, row.storage.id),
        eq(storageObjectClaims.organizationId, input.organizationId),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, row.asset.id),
        eq(storageObjectClaims.revision, row.claim.revision)
      )
    )
    .returning({ revision: storageObjectClaims.revision })
  const transferring = transferringRows[0]
  if (!transferring) throw assetConflict("promotion_race")

  const fileClaimRows = await tx
    .update(storageObjectClaims)
    .set({
      holderType: "file",
      holderId: input.plannedFileId,
      fromAssetId: null,
      toFileId: null,
      revision: sql`${storageObjectClaims.revision} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(storageObjectClaims.storageObjectId, row.storage.id),
        eq(storageObjectClaims.organizationId, input.organizationId),
        eq(storageObjectClaims.holderType, "transferring"),
        eq(storageObjectClaims.fromAssetId, row.asset.id),
        eq(storageObjectClaims.toFileId, input.plannedFileId),
        eq(storageObjectClaims.revision, transferring.revision)
      )
    )
    .returning({ storageObjectId: storageObjectClaims.storageObjectId })
  if (!fileClaimRows[0]) throw assetConflict("promotion_race")
}

const finalizePromotion = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput,
  row: PromotionSource
) => {
  const promotedRows = await tx
    .update(agentAssets)
    .set({
      status: "promoted",
      storageObjectId: null,
      promotedFileId: input.plannedFileId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(agentAssets.id, row.asset.id),
        eq(agentAssets.organizationId, input.organizationId),
        eq(agentAssets.status, "promoting"),
        eq(agentAssets.storageObjectId, row.storage.id)
      )
    )
    .returning({ id: agentAssets.id })
  if (!promotedRows[0]) throw assetConflict("promotion_race")

  const readyFiles = await tx
    .update(files)
    .set({ status: "ready", updatedAt: input.now })
    .where(
      and(
        eq(files.id, input.plannedFileId),
        eq(files.organizationId, input.organizationId),
        eq(files.status, "pending"),
        eq(files.storageObjectId, row.storage.id)
      )
    )
    .returning({ id: files.id })
  if (!readyFiles[0]) throw assetConflict("promotion_race")

  const classifiedRows = await tx
    .update(agentActionAssets)
    .set({ quotaClassifiedAt: input.now })
    .where(
      and(
        eq(agentActionAssets.organizationId, input.organizationId),
        eq(agentActionAssets.actionId, input.actionId),
        eq(agentActionAssets.assetId, input.assetId),
        eq(agentActionAssets.storageObjectId, row.storage.id),
        eq(agentActionAssets.sourceEtag, row.storage.etag),
        eq(agentActionAssets.sizeBytes, row.storage.sizeBytes),
        isNull(agentActionAssets.releasedAt),
        isNull(agentActionAssets.quotaClassifiedAt),
        gt(agentActionAssets.leaseExpiresAt, input.now)
      )
    )
    .returning({ assetId: agentActionAssets.assetId })
  if (!classifiedRows[0]) throw assetConflict("promotion_lease_changed")
}

const recordPromotion = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput,
  row: PromotionSource
) => {
  await getFileOwnerAdapter("issue").recordActivity(tx, {
    actorUserId: input.actorUserId,
    fileId: input.plannedFileId,
    filename: row.asset.filename,
    kind: "file_added",
    occurredAt: input.now,
    organizationId: input.organizationId,
    ownerId: input.issueId,
  })
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "file.uploaded",
    targetType: "file",
    targetId: input.plannedFileId,
    metadata: {},
    createdAt: input.now,
  })
}

export const promoteAgentAssetToIssueFileInTransaction = async (
  tx: AgentAssetTransaction,
  input: AgentAssetPromotionInput
): Promise<AgentAssetPromotionResult> => {
  const row = await selectPromotionSource(tx, input)
  await createPendingIssueFile(tx, input, row)
  await transferPromotionClaim(tx, input, row)
  await finalizePromotion(tx, input, row)
  await recordPromotion(tx, input, row)
  return {
    assetId: input.assetId,
    fileId: input.plannedFileId,
    sizeBytes: row.storage.sizeBytes,
    storageObjectId: row.storage.id,
  }
}
