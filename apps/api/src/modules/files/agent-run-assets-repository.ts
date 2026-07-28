import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentAssets,
  agentRunAssets,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, inArray, ne, notInArray } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import type { ValidGrant } from "../agent/public"
import {
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  AGENT_RUN_ASSET_MAX_BYTES,
  AGENT_RUN_ASSET_MAX_COUNT,
} from "./constants"

type AgentRunAssetTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

type AgentAssetScope = {
  contextEpoch: number
  organizationId: string
  sessionId: string
  threadId: string
  userId: string
}

const selectCurrentAgentAssetsInTransaction = async (
  tx: AgentRunAssetTransaction,
  input: {
    assetIds: readonly string[]
    now: Date
    scope: AgentAssetScope
  }
) => {
  if (input.assetIds.length === 0) return []
  return tx
    .select({
      assetId: agentAssets.id,
      sizeBytes: storageObjects.sizeBytes,
    })
    .from(agentAssets)
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentAssets.organizationId),
        eq(storageObjects.id, agentAssets.storageObjectId),
        eq(storageObjects.status, "ready")
      )
    )
    .innerJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, agentAssets.id)
      )
    )
    .where(
      and(
        eq(agentAssets.organizationId, input.scope.organizationId),
        eq(agentAssets.threadId, input.scope.threadId),
        eq(agentAssets.sessionId, input.scope.sessionId),
        eq(agentAssets.uploaderId, input.scope.userId),
        eq(agentAssets.contextEpoch, input.scope.contextEpoch),
        eq(agentAssets.status, "ready"),
        gt(agentAssets.expiresAt, input.now),
        inArray(agentAssets.id, input.assetIds)
      )
    )
}

export const listReusableAgentAssetsInTransaction = async (
  tx: AgentRunAssetTransaction,
  input: {
    currentAssetIds: readonly string[]
    now: Date
    scope: AgentAssetScope
  }
) => {
  const currentIds = [...input.currentAssetIds]
  if (
    currentIds.length > AGENT_RUN_ASSET_MAX_COUNT ||
    new Set(currentIds).size !== currentIds.length
  ) {
    throw publicErrors.validation("Invalid agent asset selection")
  }
  const currentAssets = await selectCurrentAgentAssetsInTransaction(tx, {
    assetIds: currentIds,
    now: input.now,
    scope: input.scope,
  })
  if (currentAssets.length !== currentIds.length) {
    throw publicErrors.notFound("Agent asset not found", {
      resource: "agent_asset",
    })
  }
  const currentBytes = currentAssets.reduce(
    (sum, asset) => sum + asset.sizeBytes,
    0
  )
  if (currentBytes > AGENT_RUN_ASSET_MAX_BYTES) {
    throw publicErrors.validation("Agent image selection is too large", {
      field: "assetIds",
      constraint: "max_total_bytes",
    })
  }
  const reusableCandidates = await tx
    .select({
      createdAt: agentAssets.createdAt,
      filename: agentAssets.filename,
      id: agentAssets.id,
    })
    .from(agentAssets)
    .innerJoin(
      agentRunAssets,
      and(
        eq(agentRunAssets.organizationId, agentAssets.organizationId),
        eq(agentRunAssets.assetId, agentAssets.id),
        eq(agentRunAssets.storageObjectId, agentAssets.storageObjectId)
      )
    )
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentAssets.organizationId),
        eq(storageObjects.id, agentAssets.storageObjectId),
        eq(agentRunAssets.sourceEtag, storageObjects.etag),
        eq(agentRunAssets.sizeBytes, storageObjects.sizeBytes),
        eq(storageObjects.status, "ready")
      )
    )
    .innerJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, agentAssets.id)
      )
    )
    .where(
      and(
        eq(agentAssets.organizationId, input.scope.organizationId),
        eq(agentAssets.threadId, input.scope.threadId),
        eq(agentAssets.sessionId, input.scope.sessionId),
        eq(agentAssets.uploaderId, input.scope.userId),
        eq(agentAssets.contextEpoch, input.scope.contextEpoch),
        eq(agentAssets.status, "ready"),
        gt(agentAssets.expiresAt, input.now),
        ...(currentIds.length > 0
          ? [notInArray(agentAssets.id, currentIds)]
          : [])
      )
    )
    .groupBy(agentAssets.id, agentAssets.filename, agentAssets.createdAt)
    .orderBy(desc(agentAssets.createdAt), desc(agentAssets.id))
    .limit(AGENT_ASSET_MAX_READY_PER_ORGANIZATION)

  return reusableCandidates.map(({ id, filename }) => ({ id, filename }))
}

export const bindAgentAssetsToRunInTransaction = async (
  tx: AgentRunAssetTransaction,
  input: {
    assetIds: readonly string[]
    context: ValidGrant
    now: Date
    runId: string
  }
) => {
  const expectedIds = [...input.assetIds].toSorted()
  if (
    new Set(expectedIds).size !== expectedIds.length ||
    expectedIds.length > AGENT_RUN_ASSET_MAX_COUNT
  ) {
    throw publicErrors.validation("Invalid agent asset selection")
  }

  const existing = await tx
    .select({
      assetId: agentRunAssets.assetId,
      sizeBytes: agentRunAssets.sizeBytes,
      sourceEtag: agentRunAssets.sourceEtag,
      storageObjectId: agentRunAssets.storageObjectId,
    })
    .from(agentRunAssets)
    .where(
      and(
        eq(agentRunAssets.organizationId, input.context.organizationId),
        eq(agentRunAssets.runId, input.runId)
      )
    )
  if (existing.length > 0 || expectedIds.length === 0) {
    const existingIds = new Set(existing.map(({ assetId }) => assetId))
    if (expectedIds.some((assetId) => !existingIds.has(assetId))) {
      throw publicErrors.conflict("Agent message id is already in use", {
        reason: "idempotency_conflict",
        resource: "agent_run",
      })
    }
    return existing
  }

  const rows = await tx
    .select({
      assetId: agentAssets.id,
      sizeBytes: storageObjects.sizeBytes,
      sourceEtag: storageObjects.etag,
      storageObjectId: storageObjects.id,
      claimHolderId: storageObjectClaims.holderId,
      claimHolderType: storageObjectClaims.holderType,
    })
    .from(agentAssets)
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentAssets.organizationId),
        eq(storageObjects.id, agentAssets.storageObjectId),
        eq(storageObjects.status, "ready")
      )
    )
    .innerJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, agentAssets.id)
      )
    )
    .where(
      and(
        eq(agentAssets.organizationId, input.context.organizationId),
        eq(agentAssets.threadId, input.context.threadId),
        eq(agentAssets.sessionId, input.context.sessionId),
        eq(agentAssets.uploaderId, input.context.userId),
        eq(agentAssets.contextEpoch, input.context.contextEpoch),
        eq(agentAssets.status, "ready"),
        gt(agentAssets.expiresAt, input.now),
        inArray(agentAssets.id, expectedIds)
      )
    )
  if (
    rows.length !== expectedIds.length ||
    rows.some(
      (row) =>
        !row.sourceEtag ||
        row.claimHolderType !== "agent_asset" ||
        row.claimHolderId !== row.assetId
    )
  ) {
    throw publicErrors.notFound("Agent asset not found", {
      resource: "agent_asset",
    })
  }
  const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0)
  if (totalBytes > AGENT_RUN_ASSET_MAX_BYTES) {
    throw publicErrors.validation("Agent image selection is too large", {
      field: "assetIds",
      constraint: "max_total_bytes",
    })
  }
  await tx.insert(agentRunAssets).values(
    rows.map((row) => ({
      organizationId: input.context.organizationId,
      runId: input.runId,
      assetId: row.assetId,
      storageObjectId: row.storageObjectId,
      sourceEtag: row.sourceEtag ?? "",
      sizeBytes: row.sizeBytes,
      createdAt: input.now,
    }))
  )
  return rows
}

export const bindReusableAgentAssetsToRunInTransaction = async (
  tx: AgentRunAssetTransaction,
  input: {
    assetIds: readonly string[]
    context: ValidGrant
    now: Date
  }
) => {
  if (!input.context.runId) {
    throw publicErrors.unauthorized("Agent capability is invalid")
  }
  const expectedIds = [...input.assetIds].toSorted()
  if (
    expectedIds.length > AGENT_RUN_ASSET_MAX_COUNT ||
    new Set(expectedIds).size !== expectedIds.length
  ) {
    throw publicErrors.validation("Invalid agent asset selection")
  }
  if (expectedIds.length === 0) return []

  const existing = await tx
    .select({
      assetId: agentRunAssets.assetId,
      sizeBytes: agentRunAssets.sizeBytes,
      sourceEtag: agentRunAssets.sourceEtag,
      storageObjectId: agentRunAssets.storageObjectId,
    })
    .from(agentRunAssets)
    .where(
      and(
        eq(agentRunAssets.organizationId, input.context.organizationId),
        eq(agentRunAssets.runId, input.context.runId)
      )
    )
  const existingIds = new Set(existing.map(({ assetId }) => assetId))
  const missingIds = expectedIds.filter((assetId) => !existingIds.has(assetId))
  if (missingIds.length === 0) return existing
  if (existing.length + missingIds.length > AGENT_RUN_ASSET_MAX_COUNT) {
    throw publicErrors.validation("Invalid agent asset selection")
  }

  const reusableRows = await tx
    .select({
      assetId: agentAssets.id,
      sizeBytes: storageObjects.sizeBytes,
      sourceEtag: storageObjects.etag,
      storageObjectId: storageObjects.id,
    })
    .from(agentAssets)
    .innerJoin(
      agentRunAssets,
      and(
        eq(agentRunAssets.organizationId, agentAssets.organizationId),
        eq(agentRunAssets.assetId, agentAssets.id),
        eq(agentRunAssets.storageObjectId, agentAssets.storageObjectId),
        ne(agentRunAssets.runId, input.context.runId)
      )
    )
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentAssets.organizationId),
        eq(storageObjects.id, agentAssets.storageObjectId),
        eq(agentRunAssets.sourceEtag, storageObjects.etag),
        eq(agentRunAssets.sizeBytes, storageObjects.sizeBytes),
        eq(storageObjects.status, "ready")
      )
    )
    .innerJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, agentAssets.id)
      )
    )
    .where(
      and(
        eq(agentAssets.organizationId, input.context.organizationId),
        eq(agentAssets.threadId, input.context.threadId),
        eq(agentAssets.sessionId, input.context.sessionId),
        eq(agentAssets.uploaderId, input.context.userId),
        eq(agentAssets.contextEpoch, input.context.contextEpoch),
        eq(agentAssets.status, "ready"),
        gt(agentAssets.expiresAt, input.now),
        inArray(agentAssets.id, missingIds)
      )
    )
    .groupBy(
      agentAssets.id,
      storageObjects.id,
      storageObjects.etag,
      storageObjects.sizeBytes
    )
  if (
    reusableRows.length !== missingIds.length ||
    reusableRows.some(({ sourceEtag }) => !sourceEtag)
  ) {
    throw publicErrors.notFound("Agent asset not found", {
      resource: "agent_asset",
    })
  }
  const combinedBytes =
    existing.reduce((sum, row) => sum + row.sizeBytes, 0) +
    reusableRows.reduce((sum, row) => sum + row.sizeBytes, 0)
  if (combinedBytes > AGENT_RUN_ASSET_MAX_BYTES) {
    throw publicErrors.validation("Agent image selection is too large", {
      field: "assetIds",
      constraint: "max_total_bytes",
    })
  }
  const snapshots = reusableRows.map((row) => ({
    organizationId: input.context.organizationId,
    runId: input.context.runId ?? "",
    assetId: row.assetId,
    storageObjectId: row.storageObjectId,
    sourceEtag: row.sourceEtag ?? "",
    sizeBytes: row.sizeBytes,
    createdAt: input.now,
  }))
  await tx.insert(agentRunAssets).values(snapshots)
  return [...existing, ...snapshots]
}
