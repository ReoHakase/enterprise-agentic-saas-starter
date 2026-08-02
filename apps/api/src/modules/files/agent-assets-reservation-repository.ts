import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentAssets,
  agentThreads,
  member,
  organizationFileUsage,
  session,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, lte, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import {
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  ensureAgentSessionContextInTransaction,
  hashedAgentUsageOperationId,
  utcUsageWindow,
} from "../agent/public"
import {
  agentAssetLimitExceeded,
  isDatabaseWriteContention,
  isUploadIdUniqueConflict,
  quotaExceeded,
  type AgentAssetWithStorage,
} from "./agent-assets-domain"
import type { AgentAssetTransaction } from "./agent-assets-repository-support"
import {
  AGENT_ASSET_HARD_LIFETIME_MS,
  AGENT_ASSET_MAX_PENDING_PER_ORGANIZATION,
  AGENT_ASSET_MAX_PENDING_PER_USER,
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  AGENT_ASSET_PENDING_LIFETIME_MS,
  AGENT_ASSET_UPLOAD_ORGANIZATION_DAILY_LIMIT,
  AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
  ORGANIZATION_FILE_QUOTA_BYTES,
} from "./constants"

export const countRows = async (
  tx: AgentAssetTransaction,
  conditions: ReturnType<typeof and>
) => {
  const rows = await tx
    .select({ count: sql<number>`count(*)` })
    .from(agentAssets)
    .where(conditions)
  return Number(rows[0]?.count ?? 0)
}

export const requireLiveUploadScope = async (
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
  if (!liveSession) throw new HttpError({ code: "unauthorized" })
  if (liveSession.activeOrganizationId !== input.organizationId) {
    throw new HttpError({ code: "active_organization_mismatch" })
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
    throw new HttpError({ code: "not_found" })
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
    throw new HttpError({ code: "not_found" })
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
    throw new HttpError({ code: "unauthorized" })
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

const findAgentAssetByUploadId = async (
  db: Db,
  input: { organizationId: string; uploadId: string }
) => selectAgentAssetByUploadId(db, input)

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
            throw new HttpError({ code: "conflict" })
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
        throw new HttpError({ code: "conflict", cause })
      }
      throw cause
    }
  }
  throw new Error("Agent asset reservation retries exhausted")
}
