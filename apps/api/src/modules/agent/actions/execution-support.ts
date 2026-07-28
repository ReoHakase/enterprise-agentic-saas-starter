import {
  agentActionAssets,
  agentActions,
  agentAssets,
  agentRunAssets,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { type AgentTransaction } from "../threads/repository"
import {
  normalizeStoredUpdateIssuePayload,
  safeStoredParse,
  storedCreateIssuePayloadModel,
  storedDeleteIssuePayloadModel,
  storedUpdateIssuePayloadModel,
  type ActionRow,
  type StoredPayload,
} from "./repository-support"

export const parseStoredPayload = (action: ActionRow): StoredPayload => {
  if (action.kind === "create_issue") {
    return {
      kind: action.kind,
      value: safeStoredParse(
        storedCreateIssuePayloadModel,
        action.normalizedPayload
      ),
    }
  }
  if (action.kind === "update_issue") {
    return {
      kind: action.kind,
      value: safeStoredParse(
        storedUpdateIssuePayloadModel,
        normalizeStoredUpdateIssuePayload(action.normalizedPayload)
      ),
    }
  }
  return {
    kind: action.kind,
    value: safeStoredParse(
      storedDeleteIssuePayloadModel,
      action.normalizedPayload
    ),
  }
}

export const markActionConflict = async (
  tx: AgentTransaction,
  action: ActionRow,
  now: Date,
  classification: string
) => {
  const rows = await tx
    .update(agentActions)
    .set({
      status: "conflicted",
      errorClassification: classification,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentActions.organizationId, action.organizationId),
        eq(agentActions.id, action.id),
        eq(agentActions.status, "approved")
      )
    )
    .returning()
  if (!rows[0]) throw new Error("Agent action conflict transition lost")
}

export const validateExecutionAssets = async (
  tx: AgentTransaction,
  action: ActionRow,
  now: Date,
  expectedAssetIds: readonly string[]
) => {
  const leases = await tx
    .select({
      assetId: agentActionAssets.assetId,
      storageObjectId: agentActionAssets.storageObjectId,
      sourceEtag: agentActionAssets.sourceEtag,
      sizeBytes: agentActionAssets.sizeBytes,
      leaseExpiresAt: agentActionAssets.leaseExpiresAt,
      releasedAt: agentActionAssets.releasedAt,
      assetStatus: agentAssets.status,
      assetStorageObjectId: agentAssets.storageObjectId,
      assetExpiresAt: agentAssets.expiresAt,
      storageStatus: storageObjects.status,
      storageEtag: storageObjects.etag,
      storageSizeBytes: storageObjects.sizeBytes,
      claimHolderType: storageObjectClaims.holderType,
      claimHolderId: storageObjectClaims.holderId,
      runStorageObjectId: agentRunAssets.storageObjectId,
      runEtag: agentRunAssets.sourceEtag,
      runSizeBytes: agentRunAssets.sizeBytes,
    })
    .from(agentActionAssets)
    .leftJoin(
      agentAssets,
      and(
        eq(agentAssets.organizationId, agentActionAssets.organizationId),
        eq(agentAssets.id, agentActionAssets.assetId)
      )
    )
    .leftJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentActionAssets.organizationId),
        eq(storageObjects.id, agentActionAssets.storageObjectId)
      )
    )
    .leftJoin(
      storageObjectClaims,
      and(
        eq(
          storageObjectClaims.organizationId,
          agentActionAssets.organizationId
        ),
        eq(
          storageObjectClaims.storageObjectId,
          agentActionAssets.storageObjectId
        )
      )
    )
    .leftJoin(
      agentRunAssets,
      and(
        eq(agentRunAssets.organizationId, agentActionAssets.organizationId),
        eq(agentRunAssets.runId, action.runId),
        eq(agentRunAssets.assetId, agentActionAssets.assetId)
      )
    )
    .where(
      and(
        eq(agentActionAssets.organizationId, action.organizationId),
        eq(agentActionAssets.actionId, action.id)
      )
    )
  const actualIds = leases.map(({ assetId }) => assetId).toSorted()
  const expectedIds = [...expectedAssetIds].toSorted()
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((assetId, index) => assetId !== expectedIds[index])
  ) {
    return false
  }
  for (const lease of leases) {
    if (
      !lease.storageObjectId ||
      lease.releasedAt !== null ||
      lease.leaseExpiresAt.getTime() < now.getTime() ||
      lease.assetStatus !== "ready" ||
      lease.assetStorageObjectId !== lease.storageObjectId ||
      !lease.assetExpiresAt ||
      lease.assetExpiresAt.getTime() < now.getTime() ||
      lease.storageStatus !== "ready" ||
      lease.storageEtag !== lease.sourceEtag ||
      lease.storageSizeBytes !== lease.sizeBytes ||
      lease.claimHolderType !== "agent_asset" ||
      lease.claimHolderId !== lease.assetId ||
      lease.runStorageObjectId !== lease.storageObjectId ||
      lease.runEtag !== lease.sourceEtag ||
      lease.runSizeBytes !== lease.sizeBytes
    ) {
      return false
    }
  }
  return true
}
