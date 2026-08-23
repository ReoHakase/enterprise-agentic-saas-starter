import {
  AGENT_ACTION_MAX_LIFETIME_MS,
  agentActions,
  agentApprovalPolicies,
  agentAssets,
  agentRunAssets,
  agentRuns,
  agentThreadPermissions,
  issues,
  member,
  storageObjectClaims,
  storageObjects,
  user,
  type AgentActionKind,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { type AgentTransaction, type ValidGrant } from "../threads/repository"
import {
  MAX_ROOT_WRITE_ACTIONS,
  safeStoredParse,
  storedCreateIssuePayloadModel,
  storedDeleteIssuePayloadModel,
  storedUpdateIssuePayloadModel,
} from "./repository-support"

export const canonicalizeLabels = async (
  tx: AgentTransaction,
  organizationId: string,
  labels: readonly string[]
): Promise<string[]> => {
  const distinctInput = new Map<string, string>()
  for (const label of labels) {
    const trimmed = label.trim()
    const key = trimmed.toLocaleLowerCase()
    if (!distinctInput.has(key)) distinctInput.set(key, trimmed)
  }
  if (distinctInput.size === 0) return []

  const rows = await tx.all<{
    normalized: string
    canonical: string
    variantCount: number | string
  }>(sql`
    select lower(trim(cast(json_each.value as text))) as normalized,
           min(trim(cast(json_each.value as text))) as canonical,
           count(distinct trim(cast(json_each.value as text))) as variantCount
    from ${issues}, json_each(${issues.labels})
    where ${issues.organizationId} = ${organizationId}
      and lower(trim(cast(json_each.value as text))) in (${sql.join(
        [...distinctInput.keys()].map((key) => sql`${key}`),
        sql`, `
      )})
    group by lower(trim(cast(json_each.value as text)))
  `)
  const existing = new Map(rows.map((row) => [row.normalized, row]))
  return [...distinctInput].map(([key, requested]) => {
    const match = existing.get(key)
    if (!match) return requested
    if (Number(match.variantCount) !== 1) {
      throw new HttpError({ code: "conflict" })
    }
    return match.canonical
  })
}

export const resolveAssigneeName = async (
  tx: AgentTransaction,
  input: { assigneeId: string | null | undefined; organizationId: string }
): Promise<string | null | undefined> => {
  if (input.assigneeId === undefined || input.assigneeId === null) {
    return input.assigneeId
  }
  const rows = await tx
    .select({ name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.assigneeId)
      )
    )
    .limit(1)
  if (!rows[0]) {
    throw new HttpError({ code: "validation_error" })
  }
  return rows[0].name
}

export const readAssigneeName = async (
  tx: AgentTransaction,
  input: { assigneeId: string | null; organizationId: string }
) => {
  if (!input.assigneeId) return null
  const rows = await tx
    .select({ name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.assigneeId)
      )
    )
    .limit(1)
  return rows[0]?.name ?? "Former member"
}

export const isAssigneeMember = async (
  tx: AgentTransaction,
  input: { assigneeId: string | null | undefined; organizationId: string }
) => {
  if (input.assigneeId === undefined || input.assigneeId === null) return true
  const rows = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.assigneeId)
      )
    )
    .limit(1)
  return rows.length === 1
}

export const expireActionsInTransaction = async (
  tx: AgentTransaction,
  input: { organizationId: string; now: Date }
) => {
  const expired = await tx
    .update(agentActions)
    .set({ status: "expired", completedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(agentActions.organizationId, input.organizationId),
        inArray(agentActions.status, ["pending", "approved"]),
        lte(agentActions.expiresAt, input.now)
      )
    )
    .returning({ id: agentActions.id })
  return expired.length
}

export const findApplicablePolicy = async (
  tx: AgentTransaction,
  context: ValidGrant,
  now: Date
) => {
  const runRows = await tx
    .select({ webSearchUsedAt: agentRuns.webSearchUsedAt })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.organizationId, context.organizationId),
        eq(agentRuns.id, context.runId ?? "")
      )
    )
    .limit(1)
  const currentRun = runRows[0]
  if (!currentRun || currentRun.webSearchUsedAt !== null) return null

  const permissionRows = await tx
    .select()
    .from(agentThreadPermissions)
    .where(
      and(
        eq(agentThreadPermissions.organizationId, context.organizationId),
        eq(agentThreadPermissions.threadId, context.threadId),
        eq(agentThreadPermissions.sessionId, context.sessionId),
        eq(agentThreadPermissions.userId, context.userId),
        eq(agentThreadPermissions.contextEpoch, context.contextEpoch),
        eq(agentThreadPermissions.mode, "full_access")
      )
    )
    .limit(1)
  if (!permissionRows[0]) return null

  await tx
    .update(agentApprovalPolicies)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(agentApprovalPolicies.organizationId, context.organizationId),
        eq(agentApprovalPolicies.threadId, context.threadId),
        eq(agentApprovalPolicies.sessionId, context.sessionId),
        eq(agentApprovalPolicies.userId, context.userId),
        isNull(agentApprovalPolicies.revokedAt)
      )
    )
  const rows = await tx
    .insert(agentApprovalPolicies)
    .values({
      id: crypto.randomUUID(),
      organizationId: context.organizationId,
      threadId: context.threadId,
      sessionId: context.sessionId,
      userId: context.userId,
      contextEpoch: context.contextEpoch,
      mode: "auto_all",
      destructiveConfirmedAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + AGENT_ACTION_MAX_LIFETIME_MS),
      updatedAt: now,
    })
    .returning()
  return rows[0] ?? null
}

export const findExistingPreparedAction = async (
  tx: AgentTransaction,
  input: {
    context: ValidGrant
    idempotencyKey: string
    kind: AgentActionKind
    requestFingerprint: string
    toolCallId: string
  }
) => {
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.organizationId, input.context.organizationId),
        or(
          eq(agentActions.idempotencyKey, input.idempotencyKey),
          and(
            eq(agentActions.runId, input.context.runId ?? ""),
            eq(agentActions.toolCallId, input.toolCallId)
          )
        )
      )
    )
    .limit(1)
  const existing = rows[0]
  if (!existing) return null
  if (
    existing.runId !== input.context.runId ||
    existing.threadId !== input.context.threadId ||
    existing.sessionId !== input.context.sessionId ||
    existing.userId !== input.context.userId ||
    existing.contextEpoch !== input.context.contextEpoch ||
    existing.kind !== input.kind ||
    existing.idempotencyKey !== input.idempotencyKey
  ) {
    throw new HttpError({ code: "conflict" })
  }
  const storedFingerprint =
    existing.kind === "create_issue"
      ? safeStoredParse(
          storedCreateIssuePayloadModel,
          existing.normalizedPayload
        ).requestFingerprint
      : existing.kind === "update_issue"
        ? safeStoredParse(
            storedUpdateIssuePayloadModel,
            existing.normalizedPayload
          ).requestFingerprint
        : safeStoredParse(
            storedDeleteIssuePayloadModel,
            existing.normalizedPayload
          ).requestFingerprint
  if (storedFingerprint !== input.requestFingerprint) {
    throw new HttpError({ code: "conflict" })
  }
  return existing
}

export type AssetSnapshot = {
  assetId: string
  filename: string
  storageObjectId: string
  sourceEtag: string
  sizeBytes: number
  expiresAt: Date
}

export const getActionAssetSnapshots = async (
  tx: AgentTransaction,
  input: {
    context: ValidGrant
    assetIds: readonly string[]
    now: Date
  }
): Promise<AssetSnapshot[]> => {
  if (input.assetIds.length === 0) return []
  if (!input.context.runId) {
    throw new HttpError({ code: "unauthorized" })
  }
  const rows = await tx
    .select({
      assetId: agentAssets.id,
      filename: agentAssets.filename,
      assetStorageObjectId: agentAssets.storageObjectId,
      expiresAt: agentAssets.expiresAt,
      runStorageObjectId: agentRunAssets.storageObjectId,
      sourceEtag: agentRunAssets.sourceEtag,
      sizeBytes: agentRunAssets.sizeBytes,
      storageEtag: storageObjects.etag,
      storageSizeBytes: storageObjects.sizeBytes,
      storageStatus: storageObjects.status,
      claimHolderType: storageObjectClaims.holderType,
      claimHolderId: storageObjectClaims.holderId,
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
        eq(storageObjectClaims.organizationId, agentRunAssets.organizationId),
        eq(storageObjectClaims.storageObjectId, agentRunAssets.storageObjectId)
      )
    )
    .where(
      and(
        eq(agentRunAssets.organizationId, input.context.organizationId),
        eq(agentRunAssets.runId, input.context.runId),
        inArray(agentRunAssets.assetId, input.assetIds),
        eq(agentAssets.threadId, input.context.threadId),
        eq(agentAssets.sessionId, input.context.sessionId),
        eq(agentAssets.contextEpoch, input.context.contextEpoch),
        eq(agentAssets.uploaderId, input.context.userId),
        eq(agentAssets.status, "ready"),
        gt(agentAssets.expiresAt, input.now)
      )
    )
  const byId = new Map(rows.map((row) => [row.assetId, row]))
  return input.assetIds.map((assetId) => {
    const row = byId.get(assetId)
    if (
      !row ||
      !row.assetStorageObjectId ||
      !row.runStorageObjectId ||
      row.assetStorageObjectId !== row.runStorageObjectId ||
      row.storageStatus !== "ready" ||
      row.storageEtag !== row.sourceEtag ||
      row.storageSizeBytes !== row.sizeBytes ||
      row.claimHolderType !== "agent_asset" ||
      row.claimHolderId !== assetId
    ) {
      throw new HttpError({ code: "conflict" })
    }
    return {
      assetId,
      filename: row.filename,
      storageObjectId: row.assetStorageObjectId,
      sourceEtag: row.sourceEtag,
      sizeBytes: row.sizeBytes,
      expiresAt: row.expiresAt,
    }
  })
}

export const reserveRootWrite = async (
  tx: AgentTransaction,
  context: ValidGrant
) => {
  if (!context.rootRunId) {
    throw new HttpError({ code: "unauthorized" })
  }
  const rows = await tx
    .update(agentRuns)
    .set({ writeCount: sql`${agentRuns.writeCount} + 1` })
    .where(
      and(
        eq(agentRuns.organizationId, context.organizationId),
        eq(agentRuns.id, context.rootRunId),
        sql`${agentRuns.writeCount} < ${MAX_ROOT_WRITE_ACTIONS}`
      )
    )
    .returning({ id: agentRuns.id })
  if (!rows[0]) {
    throw new HttpError({ code: "conflict" })
  }
}
