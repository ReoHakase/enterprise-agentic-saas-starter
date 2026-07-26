import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentAssets,
  agentRunAssets,
  files,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import {
  AGENT_USAGE_DAY_MS,
  consumeAgentResourceLimitInTransaction,
  hashAgentToken,
  hashedAgentUsageOperationId,
  utcUsageWindow,
  validateGrantInTransaction,
} from "../agent/public"
import {
  agentAssetLimitExceeded,
  assertAgentAssetClaim,
  assertPromotedAgentAssetClaim,
  assetConflict,
  assetNotFound,
  isDatabaseWriteContention,
  preserveAgentAssetError,
  type AgentAssetWithStorage,
} from "./agent-assets-domain"
import type { AgentAssetTransaction } from "./agent-assets-repository-support"
import {
  countRows,
  requireLiveUploadScope,
} from "./agent-assets-reservation-repository"
import {
  AGENT_ASSET_HARD_LIFETIME_MS,
  AGENT_ASSET_MAX_BYTES,
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  AGENT_ASSET_READY_LIFETIME_MS,
  AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT,
  AGENT_ASSET_VISION_USER_DAILY_LIMIT,
} from "./constants"

export const selectAgentAssetById = async (
  tx: AgentAssetTransaction,
  input: { assetId: string; organizationId: string }
): Promise<AgentAssetWithStorage | null> => {
  const rows = await tx
    .select({
      asset: agentAssets,
      storage: storageObjects,
      claim: storageObjectClaims,
    })
    .from(agentAssets)
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, agentAssets.organizationId),
        eq(storageObjects.id, agentAssets.storageObjectId)
      )
    )
    .leftJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id)
      )
    )
    .where(
      and(
        eq(agentAssets.id, input.assetId),
        eq(agentAssets.organizationId, input.organizationId)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

const selectPromotedAgentAssetById = async (
  tx: AgentAssetTransaction,
  input: { assetId: string; organizationId: string }
): Promise<AgentAssetWithStorage | null> => {
  const rows = await tx
    .select({
      asset: agentAssets,
      storage: storageObjects,
      claim: storageObjectClaims,
    })
    .from(agentAssets)
    .innerJoin(
      files,
      and(
        eq(files.organizationId, agentAssets.organizationId),
        eq(files.id, agentAssets.promotedFileId),
        eq(files.status, "ready")
      )
    )
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, files.organizationId),
        eq(storageObjects.id, files.storageObjectId),
        eq(storageObjects.status, "ready")
      )
    )
    .leftJoin(
      storageObjectClaims,
      and(
        eq(storageObjectClaims.organizationId, storageObjects.organizationId),
        eq(storageObjectClaims.storageObjectId, storageObjects.id)
      )
    )
    .where(
      and(
        eq(agentAssets.id, input.assetId),
        eq(agentAssets.organizationId, input.organizationId),
        eq(agentAssets.status, "promoted")
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export const finalizePendingAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    etag: string
    imageHeight: number
    imageWidth: number
    organizationId: string
    now?: Date
  }
): Promise<AgentAssetWithStorage> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- concurrent finalizeを再読込してready capへ収束させる。
      return await db.transaction(async (tx) => {
        const now = input.now ?? new Date()
        const value = await selectAgentAssetById(tx, input)
        if (!value) throw assetNotFound()
        assertAgentAssetClaim(value)
        if (!value.asset.sessionId) throw assetConflict("session_revoked")
        await requireLiveUploadScope(tx, {
          organizationId: value.asset.organizationId,
          sessionId: value.asset.sessionId,
          threadId: value.asset.threadId,
          userId: value.asset.uploaderId,
          now,
          expectedContextEpoch: value.asset.contextEpoch,
        })
        if (value.asset.status === "ready") {
          if (value.asset.expiresAt.getTime() <= now.getTime()) {
            throw assetConflict("upload_expired")
          }
          if (
            value.storage.status !== "ready" ||
            value.storage.etag !== input.etag ||
            value.storage.imageWidth !== input.imageWidth ||
            value.storage.imageHeight !== input.imageHeight
          ) {
            throw assetConflict("finalize_mismatch")
          }
          return value
        }
        if (
          value.asset.status !== "pending" ||
          value.storage.status !== "pending" ||
          value.asset.expiresAt.getTime() <= now.getTime()
        ) {
          throw assetConflict("upload_expired")
        }

        const readyForOrganization = await countRows(
          tx,
          and(
            eq(agentAssets.organizationId, input.organizationId),
            eq(agentAssets.status, "ready")
          )
        )
        if (readyForOrganization >= AGENT_ASSET_MAX_READY_PER_ORGANIZATION) {
          throw agentAssetLimitExceeded("ready_per_organization")
        }

        const storageRows = await tx
          .update(storageObjects)
          .set({
            etag: input.etag,
            imageHeight: input.imageHeight,
            imageWidth: input.imageWidth,
            status: "ready",
            updatedAt: now,
          })
          .where(
            and(
              eq(storageObjects.id, value.storage.id),
              eq(storageObjects.organizationId, input.organizationId),
              eq(storageObjects.status, "pending"),
              eq(storageObjects.cleanupRevision, value.storage.cleanupRevision)
            )
          )
          .returning()
        const storage = storageRows[0]
        if (!storage) throw assetConflict("finalize_race")

        const hardExpiresAt =
          value.asset.createdAt.getTime() + AGENT_ASSET_HARD_LIFETIME_MS
        const readyExpiresAt = new Date(
          Math.min(
            value.asset.createdAt.getTime() + AGENT_ASSET_READY_LIFETIME_MS,
            hardExpiresAt
          )
        )
        const assetRows = await tx
          .update(agentAssets)
          .set({ status: "ready", expiresAt: readyExpiresAt, updatedAt: now })
          .where(
            and(
              eq(agentAssets.id, value.asset.id),
              eq(agentAssets.organizationId, input.organizationId),
              eq(agentAssets.status, "pending"),
              eq(agentAssets.storageObjectId, storage.id),
              gt(agentAssets.expiresAt, now)
            )
          )
          .returning()
        const asset = assetRows[0]
        if (!asset) throw assetConflict("finalize_race")
        return { asset, storage, claim: value.claim }
      })
    } catch (cause) {
      if (isDatabaseWriteContention(cause) && attempt < 3) {
        // oxlint-disable-next-line no-await-in-loop -- bounded retryでcommitted winner後のcountを再検証する。
        await new Promise((resolve) => setTimeout(resolve, attempt + 1))
        continue
      }
      return preserveAgentAssetError(cause, "finalizePendingAgentAsset")
    }
  }
  throw publicErrors.internal(undefined, {
    module: "agent-assets",
    operation: "finalizePendingAgentAsset",
  })
}

export const findReadyAgentAssetForSession = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
    now?: Date
  }
): Promise<AgentAssetWithStorage> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const value = await selectAgentAssetById(tx, input)
      if (
        !value ||
        value.asset.status !== "ready" ||
        value.storage.status !== "ready" ||
        value.asset.expiresAt.getTime() <= now.getTime() ||
        value.asset.uploaderId !== input.userId ||
        value.asset.sessionId !== input.sessionId
      ) {
        throw assetNotFound()
      }
      assertAgentAssetClaim(value)
      await requireLiveUploadScope(tx, {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        threadId: value.asset.threadId,
        userId: input.userId,
        now,
        expectedContextEpoch: value.asset.contextEpoch,
      })
      return value
    })
  } catch (cause) {
    return preserveAgentAssetError(cause, "findReadyAgentAssetForSession")
  }
}

/**
 * Browser chat内のopaque asset URLを安定aliasとして解決する。
 * staged中はagent_asset claim、Issue昇格後はpromoted_file_idからfile claimを
 * tenant/session/thread owner再認可後に辿り、R2 keyをBrowserへ公開しない。
 */
export const findPreviewableAgentAssetForSession = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
    now?: Date
  }
): Promise<AgentAssetWithStorage> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const staged = await selectAgentAssetById(tx, input)
      const value =
        staged?.asset.status === "ready"
          ? staged
          : await selectPromotedAgentAssetById(tx, input)
      if (
        !value ||
        (value.asset.status !== "ready" && value.asset.status !== "promoted") ||
        value.storage.status !== "ready" ||
        value.asset.uploaderId !== input.userId ||
        value.asset.sessionId !== input.sessionId ||
        (value.asset.status === "ready" &&
          value.asset.expiresAt.getTime() <= now.getTime())
      ) {
        throw assetNotFound()
      }
      if (value.asset.status === "promoted") {
        assertPromotedAgentAssetClaim(value)
      } else {
        assertAgentAssetClaim(value)
      }
      await requireLiveUploadScope(tx, {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        threadId: value.asset.threadId,
        userId: input.userId,
        now,
        expectedContextEpoch: value.asset.contextEpoch,
      })
      return value
    })
  } catch (cause) {
    return preserveAgentAssetError(cause, "findPreviewableAgentAssetForSession")
  }
}

export const findAgentRunAssetForModel = async (
  db: Db,
  input: { grant: string; assetId: string; now?: Date }
): Promise<AgentAssetWithStorage> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now,
      })
      if (!context.runId || context.runScope !== "chat") {
        throw publicErrors.unauthorized("Agent capability is invalid")
      }
      const rows = await tx
        .select({
          asset: agentAssets,
          storage: storageObjects,
          claim: storageObjectClaims,
          sourceEtag: agentRunAssets.sourceEtag,
          snapshotSize: agentRunAssets.sizeBytes,
          snapshotStorageObjectId: agentRunAssets.storageObjectId,
        })
        .from(agentRunAssets)
        .innerJoin(
          agentAssets,
          and(
            eq(agentAssets.organizationId, agentRunAssets.organizationId),
            eq(agentAssets.id, agentRunAssets.assetId)
          )
        )
        .innerJoin(
          storageObjects,
          and(
            eq(storageObjects.organizationId, agentRunAssets.organizationId),
            eq(storageObjects.id, agentRunAssets.storageObjectId)
          )
        )
        .innerJoin(
          storageObjectClaims,
          and(
            eq(
              storageObjectClaims.organizationId,
              storageObjects.organizationId
            ),
            eq(storageObjectClaims.storageObjectId, storageObjects.id)
          )
        )
        .where(
          and(
            eq(agentRunAssets.organizationId, context.organizationId),
            eq(agentRunAssets.runId, context.runId),
            eq(agentRunAssets.assetId, input.assetId),
            eq(agentAssets.organizationId, context.organizationId),
            eq(agentAssets.threadId, context.threadId),
            eq(agentAssets.sessionId, context.sessionId),
            eq(agentAssets.uploaderId, context.userId),
            eq(agentAssets.contextEpoch, context.contextEpoch),
            eq(agentAssets.status, "ready"),
            gt(agentAssets.expiresAt, now),
            eq(storageObjects.status, "ready"),
            eq(storageObjectClaims.holderType, "agent_asset"),
            eq(storageObjectClaims.holderId, agentAssets.id)
          )
        )
        .limit(1)
      const row = rows[0]
      if (
        !row ||
        !row.storage.etag ||
        row.snapshotStorageObjectId !== row.storage.id ||
        row.sourceEtag !== row.storage.etag ||
        row.snapshotSize !== row.storage.sizeBytes ||
        row.storage.sizeBytes > AGENT_ASSET_MAX_BYTES
      ) {
        throw publicErrors.notFound("Agent asset not found", {
          resource: "agent_asset",
        })
      }
      const visionOperationId = await hashedAgentUsageOperationId(
        "vision",
        context.runId,
        input.assetId
      )
      const dailyWindow = utcUsageWindow(now, AGENT_USAGE_DAY_MS)
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "vision_transform",
        limitCount: AGENT_ASSET_VISION_USER_DAILY_LIMIT,
        now,
        operationId: visionOperationId,
        organizationId: context.organizationId,
        userId: context.userId,
        ...dailyWindow,
      })
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "vision_transform",
        limitCount: AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT,
        now,
        operationId: visionOperationId,
        organizationId: context.organizationId,
        userId: null,
        ...dailyWindow,
      })
      return { asset: row.asset, storage: row.storage, claim: row.claim }
    })
  } catch (cause) {
    return preserveAgentAssetError(cause, "findAgentRunAssetForModel")
  }
}

/**
 * approved create actionの同一transaction内だけで使うzero-copy primitive。
 * R2 I/Oを行わず、statement順は0015のimmediate trigger契約へ固定する。
 */
