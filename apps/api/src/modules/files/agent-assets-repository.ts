import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActionAssets,
  agentActions,
  agentAssets,
  agentRunAssets,
  agentThreads,
  auditLogs,
  files,
  issueFileOwners,
  member,
  organizationFileUsage,
  session,
  storageObjectClaims,
  storageObjectCleanupJobs,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../agent/context-repository"
import { hashAgentToken } from "../agent/crypto"
import { validateGrantInTransaction } from "../agent/repository"
import {
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  hashedAgentUsageOperationId,
  utcUsageWindow,
} from "../agent/resource-usage-repository"
import {
  AGENT_ASSET_MAX_BYTES,
  AGENT_ASSET_HARD_LIFETIME_MS,
  AGENT_ASSET_MAX_PENDING_PER_ORGANIZATION,
  AGENT_ASSET_MAX_PENDING_PER_USER,
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  AGENT_ASSET_PENDING_LIFETIME_MS,
  AGENT_ASSET_READY_LIFETIME_MS,
  AGENT_ASSET_UPLOAD_ORGANIZATION_DAILY_LIMIT,
  AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
  AGENT_ASSET_VISION_ORGANIZATION_DAILY_LIMIT,
  AGENT_ASSET_VISION_USER_DAILY_LIMIT,
  ORGANIZATION_FILE_QUOTA_BYTES,
} from "./constants"
import type { AgentAssetDto } from "./model"
import { getFileOwnerAdapter } from "./owner-adapters"

export type AgentAssetTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0]

export type AgentAssetWithStorage = {
  asset: typeof agentAssets.$inferSelect
  storage: typeof storageObjects.$inferSelect
  claim: typeof storageObjectClaims.$inferSelect | null
}

const preserveAgentAssetError = (cause: unknown, operation: string): never => {
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

const isUploadIdUniqueConflict = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("storage_objects_organization_upload_uidx") ||
    diagnostic.includes(
      "storage_objects.organization_id, storage_objects.upload_id"
    )
  )
}

const isDatabaseWriteContention = (cause: unknown) => {
  const diagnostic = errorDiagnostic(cause)
  return (
    diagnostic.includes("SQLITE_BUSY") || diagnostic.includes("SQLITE_LOCKED")
  )
}

const assetNotFound = () =>
  publicErrors.notFound("Agent asset not found", { resource: "agent_asset" })

const assetConflict = (reason: string) =>
  publicErrors.conflict("Agent asset changed", {
    reason,
    resource: "agent_asset",
  })

const quotaExceeded = () =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Organization image quota exceeded",
    statusCode: 429,
    publicContext: {
      constraint: "organization_storage_bytes",
      reason: "quota_exceeded",
      resource: "agent_asset",
      retryAfter: 60,
    },
  })

const agentAssetLimitExceeded = (constraint: string) =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Too many temporary images. Try again later",
    statusCode: 429,
    publicContext: {
      constraint,
      reason: "quota_exceeded",
      resource: "agent_asset",
      retryAfter: 60,
    },
  })

const countRows = async (
  tx: AgentAssetTransaction,
  conditions: ReturnType<typeof and>
) => {
  const rows = await tx
    .select({ count: sql<number>`count(*)` })
    .from(agentAssets)
    .where(conditions)
  return Number(rows[0]?.count ?? 0)
}

const requireLiveUploadScope = async (
  tx: AgentAssetTransaction,
  input: {
    organizationId: string
    sessionId: string
    threadId: string
    userId: string
    now: Date
    expectedContextEpoch?: number
  }
) => {
  const sessionRows = await tx
    .select({
      activeOrganizationId: session.activeOrganizationId,
      userId: session.userId,
    })
    .from(session)
    .where(
      and(
        eq(session.id, input.sessionId),
        eq(session.userId, input.userId),
        gt(session.expiresAt, input.now)
      )
    )
    .limit(1)
  const liveSession = sessionRows[0]
  if (!liveSession) throw publicErrors.unauthorized()
  if (liveSession.activeOrganizationId !== input.organizationId) {
    throw publicErrors.activeOrganizationMismatch()
  }

  const membershipRows = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.userId)
      )
    )
    .limit(1)
  if (!membershipRows[0]) {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }

  const threadRows = await tx
    .select({ id: agentThreads.id })
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.id, input.threadId),
        eq(agentThreads.organizationId, input.organizationId),
        eq(agentThreads.ownerUserId, input.userId),
        eq(agentThreads.status, "active")
      )
    )
    .limit(1)
  if (!threadRows[0]) {
    throw publicErrors.notFound("Agent thread not found", {
      resource: "agent_thread",
    })
  }

  const context = await ensureAgentSessionContextInTransaction(tx, {
    sessionId: input.sessionId,
    userId: input.userId,
    now: input.now,
  })
  if (
    input.expectedContextEpoch !== undefined &&
    context.contextEpoch !== input.expectedContextEpoch
  ) {
    throw publicErrors.unauthorized("Agent context is no longer active")
  }
  return context.contextEpoch
}

const selectAgentAssetByUploadId = async <TDatabase extends Pick<Db, "select">>(
  tx: TDatabase,
  input: { organizationId: string; uploadId: string }
): Promise<AgentAssetWithStorage | null> => {
  const rows = await tx
    .select({
      asset: agentAssets,
      storage: storageObjects,
      claim: storageObjectClaims,
    })
    .from(storageObjects)
    .innerJoin(
      agentAssets,
      and(
        eq(agentAssets.organizationId, storageObjects.organizationId),
        eq(agentAssets.storageObjectId, storageObjects.id)
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
        eq(storageObjects.organizationId, input.organizationId),
        eq(storageObjects.uploadId, input.uploadId)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export const findAgentAssetByUploadId = async (
  db: Db,
  input: { organizationId: string; uploadId: string }
) => {
  try {
    return await selectAgentAssetByUploadId(db, input)
  } catch (cause) {
    return preserveAgentAssetError(cause, "findAgentAssetByUploadId")
  }
}

export const reservePendingAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    declaredContentType: string
    detectedImageFormat: "jpeg" | "png" | "webp" | "gif"
    filename: string
    objectKey: string
    organizationId: string
    sessionId: string
    sizeBytes: number
    storageObjectId: string
    threadId: string
    uploadId: string
    uploaderId: string
    now?: Date
  }
): Promise<{ created: boolean; value: AgentAssetWithStorage }> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded retryで同じreservationを収束させる。
      return await db.transaction(async (tx) => {
        const now = input.now ?? new Date()
        const existing = await selectAgentAssetByUploadId(tx, input)
        if (existing) {
          if (
            (existing.asset.status !== "pending" &&
              existing.asset.status !== "ready") ||
            existing.asset.expiresAt.getTime() <= now.getTime()
          ) {
            throw publicErrors.conflict("Upload id is no longer reusable", {
              reason: "upload_expired",
              resource: "agent_asset",
            })
          }
          await requireLiveUploadScope(tx, {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            threadId: input.threadId,
            userId: input.uploaderId,
            now,
            expectedContextEpoch: existing.asset.contextEpoch,
          })
          return { created: false, value: existing }
        }

        const contextEpoch = await requireLiveUploadScope(tx, {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          threadId: input.threadId,
          userId: input.uploaderId,
          now,
        })

        const uploadOperationId = await hashedAgentUsageOperationId(
          "asset-upload",
          input.uploadId
        )
        const hourlyWindow = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
        const dailyWindow = utcUsageWindow(now, AGENT_USAGE_DAY_MS)
        await consumeAgentResourceLimitInTransaction(tx, {
          kind: "asset_upload",
          limitCount: AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
          now,
          operationId: uploadOperationId,
          organizationId: input.organizationId,
          userId: input.uploaderId,
          ...hourlyWindow,
        })
        await consumeAgentResourceLimitInTransaction(tx, {
          kind: "asset_upload",
          limitCount: AGENT_ASSET_UPLOAD_ORGANIZATION_DAILY_LIMIT,
          now,
          operationId: uploadOperationId,
          organizationId: input.organizationId,
          userId: null,
          ...dailyWindow,
        })

        const [pendingForUser, pendingForOrganization, readyForOrganization] =
          await Promise.all([
            countRows(
              tx,
              and(
                eq(agentAssets.organizationId, input.organizationId),
                eq(agentAssets.uploaderId, input.uploaderId),
                eq(agentAssets.status, "pending")
              )
            ),
            countRows(
              tx,
              and(
                eq(agentAssets.organizationId, input.organizationId),
                eq(agentAssets.status, "pending")
              )
            ),
            countRows(
              tx,
              and(
                eq(agentAssets.organizationId, input.organizationId),
                eq(agentAssets.status, "ready")
              )
            ),
          ])
        if (pendingForUser >= AGENT_ASSET_MAX_PENDING_PER_USER) {
          throw agentAssetLimitExceeded("pending_per_user")
        }
        if (
          pendingForOrganization >= AGENT_ASSET_MAX_PENDING_PER_ORGANIZATION
        ) {
          throw agentAssetLimitExceeded("pending_per_organization")
        }
        if (readyForOrganization >= AGENT_ASSET_MAX_READY_PER_ORGANIZATION) {
          throw agentAssetLimitExceeded("ready_per_organization")
        }

        const usageRows = await tx
          .insert(organizationFileUsage)
          .values({
            organizationId: input.organizationId,
            usedBytes: input.sizeBytes,
            temporaryBytes: input.sizeBytes,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: organizationFileUsage.organizationId,
            set: {
              usedBytes: sql`${organizationFileUsage.usedBytes} + ${input.sizeBytes}`,
              temporaryBytes: sql`${organizationFileUsage.temporaryBytes} + ${input.sizeBytes}`,
              updatedAt: now,
            },
            setWhere: lte(
              organizationFileUsage.usedBytes,
              ORGANIZATION_FILE_QUOTA_BYTES - input.sizeBytes
            ),
          })
          .returning({ usedBytes: organizationFileUsage.usedBytes })
        if (!usageRows[0]) throw quotaExceeded()

        const storageRows = await tx
          .insert(storageObjects)
          .values({
            id: input.storageObjectId,
            organizationId: input.organizationId,
            uploaderId: input.uploaderId,
            uploadId: input.uploadId,
            objectKey: input.objectKey,
            sizeBytes: input.sizeBytes,
            declaredContentType: input.declaredContentType,
            detectedImageFormat: input.detectedImageFormat,
            status: "pending",
            keyVersion: 2,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        const storage = storageRows[0]
        if (!storage) throw new Error("Storage object insert returned no row")

        const assetRows = await tx
          .insert(agentAssets)
          .values({
            id: input.assetId,
            organizationId: input.organizationId,
            threadId: input.threadId,
            sessionId: input.sessionId,
            contextEpoch,
            uploaderId: input.uploaderId,
            storageObjectId: input.storageObjectId,
            filename: input.filename,
            status: "pending",
            expiresAt: new Date(
              Math.min(
                now.getTime() + AGENT_ASSET_PENDING_LIFETIME_MS,
                now.getTime() + AGENT_ASSET_HARD_LIFETIME_MS
              )
            ),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        const asset = assetRows[0]
        if (!asset) throw new Error("Agent asset insert returned no row")

        const claimRows = await tx
          .insert(storageObjectClaims)
          .values({
            storageObjectId: storage.id,
            organizationId: input.organizationId,
            holderType: "agent_asset",
            holderId: asset.id,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        const claim = claimRows[0]
        if (!claim) throw new Error("Storage claim insert returned no row")
        return { created: true, value: { asset, storage, claim } }
      })
    } catch (cause) {
      if (isDatabaseWriteContention(cause) && attempt < 3) {
        // oxlint-disable-next-line no-await-in-loop -- local libSQL contentionだけを短くretryする。
        await new Promise((resolve) => setTimeout(resolve, attempt + 1))
        continue
      }
      if (isUploadIdUniqueConflict(cause)) {
        // oxlint-disable-next-line no-await-in-loop -- committed winnerをtenant scopeで取得する。
        const existing = await findAgentAssetByUploadId(db, input)
        if (existing) return { created: false, value: existing }
        throw publicErrors.conflict("Upload id is no longer reusable", {
          reason: "upload_expired",
          resource: "agent_asset",
        })
      }
      return preserveAgentAssetError(cause, "reservePendingAgentAsset")
    }
  }
  throw publicErrors.internal(undefined, {
    module: "agent-assets",
    operation: "reservePendingAgentAsset",
  })
}

const selectAgentAssetById = async (
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

const assertAgentAssetClaim = (value: AgentAssetWithStorage) => {
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
export const promoteAgentAssetToIssueFileInTransaction = async (
  tx: AgentAssetTransaction,
  input: {
    actionId: string
    actorUserId: string
    assetId: string
    issueId: string
    now: Date
    organizationId: string
    plannedFileId: string
  }
): Promise<{
  assetId: string
  fileId: string
  sizeBytes: number
  storageObjectId: string
}> => {
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
  if (
    !row ||
    row.actionAssetReleasedAt !== null ||
    row.actionAssetQuotaClassifiedAt !== null ||
    row.actionAssetLeaseExpiresAt.getTime() <= input.now.getTime() ||
    row.actionAssetStorageObjectId !== row.storage.id ||
    row.actionAssetSourceEtag !== row.storage.etag ||
    row.actionAssetSizeBytes !== row.storage.sizeBytes ||
    row.runAssetStorageObjectId !== row.storage.id ||
    row.runAssetSourceEtag !== row.storage.etag ||
    row.runAssetSizeBytes !== row.storage.sizeBytes ||
    row.asset.status !== "ready" ||
    row.asset.expiresAt.getTime() <= input.now.getTime() ||
    row.asset.storageObjectId !== row.storage.id ||
    row.asset.organizationId !== input.organizationId ||
    row.asset.threadId !== row.actionThreadId ||
    row.asset.sessionId !== row.actionSessionId ||
    row.asset.uploaderId !== row.actionUserId ||
    row.asset.contextEpoch !== row.actionContextEpoch ||
    row.storage.status !== "ready" ||
    !row.storage.objectKey ||
    !row.storage.etag ||
    row.claim.holderType !== "agent_asset" ||
    row.claim.holderId !== row.asset.id
  ) {
    throw assetConflict("promotion_precondition_changed")
  }

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

  return {
    assetId: input.assetId,
    fileId: input.plannedFileId,
    sizeBytes: row.storage.sizeBytes,
    storageObjectId: row.storage.id,
  }
}

const releaseTemporaryUsage = async (
  tx: AgentAssetTransaction,
  input: { organizationId: string; sizeBytes: number; now: Date }
) => {
  const rows = await tx
    .update(organizationFileUsage)
    .set({
      usedBytes: sql`${organizationFileUsage.usedBytes} - ${input.sizeBytes}`,
      temporaryBytes: sql`${organizationFileUsage.temporaryBytes} - ${input.sizeBytes}`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(organizationFileUsage.organizationId, input.organizationId),
        sql`${organizationFileUsage.usedBytes} >= ${input.sizeBytes}`,
        sql`${organizationFileUsage.temporaryBytes} >= ${input.sizeBytes}`
      )
    )
    .returning({ organizationId: organizationFileUsage.organizationId })
  if (!rows[0]) throw new Error("Temporary storage usage is inconsistent")
}

export const claimAgentAssetForCleanupInTransaction = async (
  tx: AgentAssetTransaction,
  input: {
    assetId: string
    organizationId: string
    terminalStatus: "deleted" | "expired"
    now: Date
    requireExpired: boolean
    activeLease: "conflict" | "skip"
    expected?: {
      assetStatus: "pending" | "ready"
      claimRevision: number
      storageCleanupRevision: number
      storageStatus: "pending" | "ready"
    }
  }
): Promise<boolean> => {
  const value = await selectAgentAssetById(tx, input)
  if (!value) return false
  if (
    (value.asset.status !== "pending" && value.asset.status !== "ready") ||
    (value.storage.status !== "pending" && value.storage.status !== "ready") ||
    (input.expected !== undefined &&
      (value.asset.status !== input.expected.assetStatus ||
        value.claim?.revision !== input.expected.claimRevision ||
        value.storage.cleanupRevision !==
          input.expected.storageCleanupRevision ||
        value.storage.status !== input.expected.storageStatus)) ||
    (input.requireExpired &&
      value.asset.expiresAt.getTime() > input.now.getTime())
  ) {
    return false
  }
  assertAgentAssetClaim(value)
  // DB state machineはterminal actionのAFTER triggerがreleasedAtを入れるまで
  // asset cleanupを許さない。期限切れleaseもaction sweepとの競合中は触らない。
  const unreleasedLeaseRows = await tx
    .select({ actionId: agentActionAssets.actionId })
    .from(agentActionAssets)
    .where(
      and(
        eq(agentActionAssets.organizationId, input.organizationId),
        eq(agentActionAssets.assetId, input.assetId),
        isNull(agentActionAssets.releasedAt)
      )
    )
    .limit(1)
  if (unreleasedLeaseRows[0]) {
    if (input.activeLease === "conflict") {
      throw publicErrors.conflict("Agent asset is awaiting a decision", {
        reason: "action_lease_active",
        resource: "agent_asset",
      })
    }
    return false
  }

  const deletedClaims = await tx
    .delete(storageObjectClaims)
    .where(
      and(
        eq(storageObjectClaims.storageObjectId, value.storage.id),
        eq(storageObjectClaims.organizationId, input.organizationId),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, value.asset.id),
        eq(storageObjectClaims.revision, value.claim?.revision ?? -1)
      )
    )
    .returning({ storageObjectId: storageObjectClaims.storageObjectId })
  if (!deletedClaims[0]) return false

  const assetRows = await tx
    .update(agentAssets)
    .set({
      storageObjectId: null,
      status: input.terminalStatus,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(agentAssets.id, value.asset.id),
        eq(agentAssets.organizationId, input.organizationId),
        eq(agentAssets.storageObjectId, value.storage.id),
        eq(agentAssets.status, value.asset.status),
        ...(input.requireExpired ? [lte(agentAssets.expiresAt, input.now)] : [])
      )
    )
    .returning({ id: agentAssets.id })
  if (!assetRows[0]) throw new Error("Agent asset cleanup lost its claim")

  await releaseTemporaryUsage(tx, {
    organizationId: input.organizationId,
    sizeBytes: value.storage.sizeBytes,
    now: input.now,
  })
  const storageRows = await tx
    .update(storageObjects)
    .set({
      status: "deleting",
      cleanupRevision: sql`${storageObjects.cleanupRevision} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(storageObjects.id, value.storage.id),
        eq(storageObjects.organizationId, input.organizationId),
        eq(storageObjects.status, value.storage.status),
        eq(storageObjects.cleanupRevision, value.storage.cleanupRevision)
      )
    )
    .returning({
      cleanupRevision: storageObjects.cleanupRevision,
      objectKey: storageObjects.objectKey,
    })
  const storage = storageRows[0]
  if (!storage?.objectKey) throw new Error("Storage cleanup lost its fence")
  await tx.insert(storageObjectCleanupJobs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    storageObjectId: value.storage.id,
    expectedCleanupRevision: storage.cleanupRevision,
    objectKey: storage.objectKey,
    status: "pending",
    createdAt: input.now,
  })
  return true
}

export const discardPendingAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    expectedClaimRevision: number
    expectedStorageCleanupRevision: number
    now?: Date
  }
) => {
  try {
    return await db.transaction((tx) =>
      claimAgentAssetForCleanupInTransaction(tx, {
        ...input,
        now: input.now ?? new Date(),
        activeLease: "skip",
        expected: {
          assetStatus: "pending",
          claimRevision: input.expectedClaimRevision,
          storageCleanupRevision: input.expectedStorageCleanupRevision,
          storageStatus: "pending",
        },
        requireExpired: false,
        terminalStatus: "expired",
      })
    )
  } catch (cause) {
    return preserveAgentAssetError(cause, "discardPendingAgentAsset")
  }
}

export const deleteReadyAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
    now?: Date
  }
) => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const value = await selectAgentAssetById(tx, input)
      if (
        !value ||
        value.asset.status !== "ready" ||
        value.asset.uploaderId !== input.userId ||
        value.asset.sessionId !== input.sessionId
      ) {
        throw assetNotFound()
      }
      await requireLiveUploadScope(tx, {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        threadId: value.asset.threadId,
        userId: input.userId,
        now,
        expectedContextEpoch: value.asset.contextEpoch,
      })
      const claimed = await claimAgentAssetForCleanupInTransaction(tx, {
        assetId: input.assetId,
        organizationId: input.organizationId,
        terminalStatus: "deleted",
        now,
        activeLease: "conflict",
        requireExpired: false,
      })
      if (!claimed) throw assetNotFound()
      return true
    })
  } catch (cause) {
    return preserveAgentAssetError(cause, "deleteReadyAgentAsset")
  }
}

export const expireDueAgentAssets = async (
  db: Db,
  input: { now?: Date; limit?: number } = {}
) => {
  const now = input.now ?? new Date()
  const candidates = await db
    .select({
      assetId: agentAssets.id,
      organizationId: agentAssets.organizationId,
    })
    .from(agentAssets)
    .where(
      and(
        inArray(agentAssets.status, ["pending", "ready"]),
        lte(agentAssets.expiresAt, now)
      )
    )
    .limit(input.limit ?? 25)
  let expired = 0
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- 各assetを短いfenced transactionでclaimする。
    const claimed = await db.transaction((tx) =>
      claimAgentAssetForCleanupInTransaction(tx, {
        ...candidate,
        now,
        activeLease: "skip",
        requireExpired: true,
        terminalStatus: "expired",
      })
    )
    if (claimed) expired += 1
  }
  return { considered: candidates.length, expired }
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
