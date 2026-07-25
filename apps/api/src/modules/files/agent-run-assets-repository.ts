import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentAssets,
  agentRunAssets,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import type { ValidGrant } from "../agent/public"
import {
  AGENT_RUN_ASSET_MAX_BYTES,
  AGENT_RUN_ASSET_MAX_COUNT,
} from "./constants"

type AgentRunAssetTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

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
    const existingIds = existing.map(({ assetId }) => assetId).toSorted()
    if (
      existingIds.length !== expectedIds.length ||
      existingIds.some((assetId, index) => assetId !== expectedIds[index])
    ) {
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
