import type { Db } from "@enterprise-agentic-saas/db"
import {
  AGENT_ACTION_MAX_LIFETIME_MS,
  AGENT_RESUME_TICKET_MAX_LIFETIME_MS,
  agentActionAssets,
  agentActions,
  agentApprovalPolicies,
  agentAssets,
  agentGrants,
  agentResumeTickets,
  agentRunAssets,
  agentRuns,
  issues,
  member,
  storageObjectClaims,
  storageObjects,
  user,
  type AgentActionKind,
  type AgentApprovalPolicyMode,
  type IssuePriority,
  type IssueStatus,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm"
import * as v from "valibot"

import type {
  AgentActionExecutionResult,
  AgentApprovalPolicy,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentIssueAction,
  AgentIssueActionPreview,
  AgentResumeTicket,
  AgentRunGrant,
  AgentUpdateIssueActionInput,
} from "../../agent-client"
import { AppError, publicErrors } from "../../errors/app-error"
import { promoteAgentAssetToIssueFileInTransaction } from "../files/agent-assets-repository"
import {
  deleteIssueInTransaction,
  insertIssueInTransaction,
  updateIssueInTransaction,
} from "../issues/repository"
import { ensureAgentSessionContextInTransaction } from "./context-repository"
import { createAgentToken, hashAgentToken } from "./crypto"
import {
  agentIssueActionPreviewModel,
  createIssueActionPayloadModel,
  deleteIssueActionPayloadModel,
  updateIssueActionPayloadModel,
} from "./model"
import {
  createGrantInTransaction,
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
  validateGrantInTransaction,
  type AgentTransaction,
  type ValidGrant,
} from "./repository"

const ACTION_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const ACTION_RESUME_RUN_TTL_MS = 5 * 60 * 1000
const MAX_ROOT_WRITE_ACTIONS = 5

type ActionRow = typeof agentActions.$inferSelect

type StoredAttachment = {
  assetId: string
  fileId: string
}

type StoredCreateIssuePayload = {
  requestFingerprint: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  labels: string[]
  dueDate: string | null
  attachments: StoredAttachment[]
}

type StoredUpdateIssuePayload = {
  requestFingerprint: string
  issueId: string
  expectedRevision: number
  changes: {
    title?: string
    description?: string
    status?: IssueStatus
    priority?: IssuePriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
}

type StoredDeleteIssuePayload = {
  requestFingerprint: string
  issueId: string
  expectedRevision: number
}

type StoredPayload =
  | { kind: "create_issue"; value: StoredCreateIssuePayload }
  | { kind: "update_issue"; value: StoredUpdateIssuePayload }
  | { kind: "delete_issue"; value: StoredDeleteIssuePayload }

type PrepareInput = {
  grant: string
  toolCallId: string
  idempotencyKey: string
  now?: Date
}

const storedAttachmentModel = v.strictObject({
  assetId: v.string(),
  fileId: v.string(),
})

const requestFingerprintModel = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))

const storedCreateIssuePayloadModel = v.strictObject({
  requestFingerprint: requestFingerprintModel,
  title: v.string(),
  description: v.string(),
  status: v.picklist(["open", "in_progress", "closed"]),
  priority: v.picklist(["no_priority", "low", "medium", "high", "urgent"]),
  assigneeId: v.nullable(v.string()),
  labels: v.array(v.string()),
  dueDate: v.nullable(v.string()),
  attachments: v.array(storedAttachmentModel),
})

const storedUpdateIssuePayloadModel = v.strictObject({
  requestFingerprint: requestFingerprintModel,
  issueId: v.string(),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  changes: v.strictObject({
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.picklist(["open", "in_progress", "closed"])),
    priority: v.optional(
      v.picklist(["no_priority", "low", "medium", "high", "urgent"])
    ),
    assigneeId: v.optional(v.nullable(v.string())),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.nullable(v.string())),
  }),
})

const storedDeleteIssuePayloadModel = v.strictObject({
  requestFingerprint: requestFingerprintModel,
  issueId: v.string(),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

const storedReceiptModel = v.strictObject({
  issueId: v.string(),
  number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  deleted: v.boolean(),
})

const preserveAgentActionError = (cause: unknown, operation: string): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, { module: "agent_action", operation })
}

const databaseDiagnostic = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return messages.join(" ")
}

const isPrepareIdempotencyRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_actions_idempotency_uidx") ||
    diagnostic.includes(
      "agent_actions.organization_id, agent_actions.idempotency_key"
    )
  )
}

const isPrepareRetryableRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    isPrepareIdempotencyRace(cause) ||
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED")
  )
}

const isActiveAssetLeaseConflict = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_action_assets_active_asset_uidx") ||
    diagnostic.includes(
      "UNIQUE constraint failed: agent_action_assets.asset_id"
    )
  )
}

const isDecisionIdempotencyRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    diagnostic.includes("agent_actions_decision_idempotency_uidx") ||
    diagnostic.includes(
      "agent_actions.organization_id, agent_actions.decision_idempotency_key"
    )
  )
}

class AgentActionWriteRaceError extends Error {}

const agentActionQueues = new Map<string, Promise<void>>()
const releaseAgentActionQueue = () => {}

const withAgentActionLock = async <T>(
  actionId: string,
  operation: () => Promise<T>
) => {
  const previous = agentActionQueues.get(actionId) ?? Promise.resolve()
  let release = releaseAgentActionQueue
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  agentActionQueues.set(actionId, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (agentActionQueues.get(actionId) === queued) {
      agentActionQueues.delete(actionId)
    }
  }
}

const withAgentPrepareLock = async <T>(
  grant: string,
  operation: () => Promise<T>
) => withAgentActionLock(`prepare:${await hashAgentToken(grant)}`, operation)

const isActionWriteRetryableRace = (cause: unknown) => {
  const diagnostic = databaseDiagnostic(cause)
  return (
    cause instanceof AgentActionWriteRaceError ||
    isDecisionIdempotencyRace(cause) ||
    diagnostic.includes("issues_organization_number_uidx") ||
    diagnostic.includes("issues.organization_id, issues.number") ||
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED")
  )
}

const canonicalJson = (value: unknown): string => {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  return `{${Object.keys(value)
    .toSorted()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
    )
    .join(",")}}`
}

const actionRequestFingerprint = async (value: unknown) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value))
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

const safeStoredParse = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) throw new Error("Stored agent action is invalid")
  return result.output
}

const toActionDto = (action: ActionRow): AgentIssueAction => {
  const preview =
    action.canonicalPreview === null
      ? null
      : safeStoredParse(agentIssueActionPreviewModel, action.canonicalPreview)
  return {
    id: action.id,
    kind: action.kind,
    status: action.status,
    approvalMode: action.decisionProvenance,
    requiresApproval: action.status === "pending",
    preview,
    expiresAt: action.expiresAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
  }
}

const normalizeDueDate = (value: string | null | undefined) => {
  if (value === undefined || value === null) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw publicErrors.validation("Invalid due date and time", {
      field: "dueDate",
    })
  }
  return date.toISOString()
}

const parseDueDate = (value: string | null | undefined) =>
  value === undefined || value === null ? value : new Date(value)

const canonicalizeLabels = async (
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
      throw publicErrors.conflict("Issue label is ambiguous", {
        reason: "label_case_ambiguous",
        resource: "issue_label",
      })
    }
    return match.canonical
  })
}

const resolveAssigneeName = async (
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
    throw publicErrors.validation(
      "Assignee must be a member of the organization",
      { field: "assigneeId", reason: "not_a_member" }
    )
  }
  return rows[0].name
}

const readAssigneeName = async (
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

const isAssigneeMember = async (
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

const expireActionsInTransaction = async (
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

const findApplicablePolicy = async (
  tx: AgentTransaction,
  context: ValidGrant,
  kind: AgentActionKind,
  now: Date
) => {
  const rows = await tx
    .select()
    .from(agentApprovalPolicies)
    .where(
      and(
        eq(agentApprovalPolicies.organizationId, context.organizationId),
        eq(agentApprovalPolicies.threadId, context.threadId),
        eq(agentApprovalPolicies.sessionId, context.sessionId),
        eq(agentApprovalPolicies.userId, context.userId),
        eq(agentApprovalPolicies.contextEpoch, context.contextEpoch),
        isNull(agentApprovalPolicies.revokedAt),
        gt(agentApprovalPolicies.expiresAt, now)
      )
    )
    .limit(1)
  const policy = rows[0]
  if (!policy) return null
  if (policy.mode === "auto_all") return policy
  if (
    policy.mode === "auto_write" &&
    (kind === "create_issue" || kind === "update_issue")
  ) {
    return policy
  }
  return null
}

const findExistingPreparedAction = async (
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
    existing.toolCallId !== input.toolCallId ||
    existing.idempotencyKey !== input.idempotencyKey
  ) {
    throw publicErrors.conflict("Agent action idempotency conflict", {
      reason: "idempotency_conflict",
      resource: "agent_action",
    })
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
    throw publicErrors.conflict("Agent action idempotency conflict", {
      reason: "idempotency_conflict",
      resource: "agent_action",
    })
  }
  return existing
}

type AssetSnapshot = {
  assetId: string
  filename: string
  storageObjectId: string
  sourceEtag: string
  sizeBytes: number
  expiresAt: Date
}

const getActionAssetSnapshots = async (
  tx: AgentTransaction,
  input: {
    context: ValidGrant
    assetIds: readonly string[]
    now: Date
  }
): Promise<AssetSnapshot[]> => {
  if (input.assetIds.length === 0) return []
  if (!input.context.runId) {
    throw publicErrors.unauthorized("Agent capability is invalid")
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
      throw publicErrors.conflict("Agent attachment changed", {
        reason: "asset_snapshot_changed",
        resource: "agent_asset",
      })
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

const reserveRootWrite = async (tx: AgentTransaction, context: ValidGrant) => {
  if (!context.rootRunId) {
    throw publicErrors.unauthorized("Agent capability is invalid")
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
    throw publicErrors.conflict("Agent write limit reached", {
      reason: "write_limit_reached",
      resource: "agent_run",
    })
  }
}

const validatePrepareGrant = async (
  tx: AgentTransaction,
  grant: string,
  now: Date
) => {
  const context = await validateGrantInTransaction(tx, {
    tokenHash: await hashAgentToken(grant),
    kind: "run",
    now,
    allowTerminalRun: true,
  })
  if (
    !context.runId ||
    !context.rootRunId ||
    context.runScope !== "chat" ||
    !context.runStatus
  ) {
    throw publicErrors.conflict("Agent run cannot prepare another action", {
      reason: "invalid_run_scope",
      resource: "agent_run",
    })
  }
  return context
}

const persistPreparedAction = async (
  tx: AgentTransaction,
  input: {
    context: ValidGrant
    kind: AgentActionKind
    targetId: string
    targetRevision: number | null
    normalizedPayload: Record<string, unknown>
    preview: AgentIssueActionPreview
    snapshots: AssetSnapshot[]
    idempotencyKey: string
    toolCallId: string
    now: Date
  }
) => {
  const expiresAt = new Date(
    Math.min(
      input.now.getTime() + AGENT_ACTION_MAX_LIFETIME_MS,
      ...input.snapshots.map((snapshot) => snapshot.expiresAt.getTime())
    )
  )
  if (expiresAt.getTime() <= input.now.getTime()) {
    throw publicErrors.conflict("Agent attachment expired", {
      reason: "asset_expired",
      resource: "agent_asset",
    })
  }
  const policy = await findApplicablePolicy(
    tx,
    input.context,
    input.kind,
    input.now
  )
  const status = policy ? "approved" : "pending"
  const actionId = crypto.randomUUID()
  const rows = await tx
    .insert(agentActions)
    .values({
      id: actionId,
      organizationId: input.context.organizationId,
      threadId: input.context.threadId,
      runId: input.context.runId ?? "",
      sessionId: input.context.sessionId,
      userId: input.context.userId,
      contextEpoch: input.context.contextEpoch,
      toolCallId: input.toolCallId,
      kind: input.kind,
      normalizedPayload: input.normalizedPayload,
      canonicalPreview: input.preview,
      targetId: input.targetId,
      targetRevision: input.targetRevision,
      status,
      decisionProvenance: policy ? "auto_policy" : null,
      decisionPolicyId: policy?.id ?? null,
      decidedAt: policy ? input.now : null,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now,
      expiresAt,
    })
    .returning()
  const action = rows[0]
  if (!action) throw new Error("Agent action insert returned no row")

  if (input.snapshots.length > 0) {
    await tx.insert(agentActionAssets).values(
      input.snapshots.map((snapshot) => ({
        organizationId: input.context.organizationId,
        actionId,
        assetId: snapshot.assetId,
        storageObjectId: snapshot.storageObjectId,
        sourceEtag: snapshot.sourceEtag,
        sizeBytes: snapshot.sizeBytes,
        leaseExpiresAt: expiresAt,
        createdAt: input.now,
      }))
    )
  }
  if (!policy) {
    const waiting = await tx
      .update(agentRuns)
      .set({ status: "waiting_approval" })
      .where(
        and(
          eq(agentRuns.organizationId, input.context.organizationId),
          eq(agentRuns.id, input.context.runId ?? ""),
          eq(agentRuns.status, "running")
        )
      )
      .returning({ id: agentRuns.id })
    if (!waiting[0]) throw new Error("Agent run changed during prepare")
  }
  return action
}

const prepareInTransaction = async (
  tx: AgentTransaction,
  input:
    | (PrepareInput & {
        kind: "create_issue"
        issue: AgentCreateIssueActionInput
      })
    | (PrepareInput & {
        kind: "update_issue"
        issue: AgentUpdateIssueActionInput
      })
    | (PrepareInput & {
        kind: "delete_issue"
        issue: AgentDeleteIssueActionInput
      })
) => {
  const now = input.now ?? new Date()
  const requestFingerprint = await actionRequestFingerprint({
    issue: input.issue,
    kind: input.kind,
  })
  const context = await validatePrepareGrant(tx, input.grant, now)
  await expireActionsInTransaction(tx, {
    organizationId: context.organizationId,
    now,
  })
  const existing = await findExistingPreparedAction(tx, {
    context,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    requestFingerprint,
    toolCallId: input.toolCallId,
  })
  if (existing) return existing
  if (context.runStatus !== "running") {
    throw publicErrors.conflict("Agent run cannot prepare another action", {
      reason: "invalid_run_scope",
      resource: "agent_run",
    })
  }

  let targetId: string
  let targetRevision: number | null
  let normalizedPayload: Record<string, unknown>
  let preview: AgentIssueActionPreview
  let snapshots: AssetSnapshot[] = []

  if (input.kind === "create_issue") {
    const issue = safeStoredParse(createIssueActionPayloadModel, input.issue)
    const labels = await canonicalizeLabels(
      tx,
      context.organizationId,
      issue.labels ?? []
    )
    const assigneeName = await resolveAssigneeName(tx, {
      assigneeId: issue.assigneeId,
      organizationId: context.organizationId,
    })
    snapshots = await getActionAssetSnapshots(tx, {
      context,
      assetIds: issue.attachmentAssetIds,
      now,
    })
    targetId = crypto.randomUUID()
    targetRevision = null
    const stored: StoredCreateIssuePayload = {
      requestFingerprint,
      title: issue.title,
      description: issue.description?.trim() ?? "",
      status: issue.status ?? "open",
      priority: issue.priority ?? "no_priority",
      assigneeId: issue.assigneeId ?? null,
      labels,
      dueDate: normalizeDueDate(issue.dueDate) ?? null,
      attachments: snapshots.map(({ assetId }) => ({
        assetId,
        fileId: crypto.randomUUID(),
      })),
    }
    normalizedPayload = stored
    preview = {
      kind: input.kind,
      destructive: false,
      title: stored.title,
      issueNumber: null,
      issueRevision: null,
      fields: [
        { field: "title", before: null, after: stored.title },
        { field: "description", before: null, after: stored.description },
        { field: "status", before: null, after: stored.status },
        { field: "priority", before: null, after: stored.priority },
        { field: "assignee", before: null, after: assigneeName ?? null },
        { field: "labels", before: null, after: stored.labels },
        { field: "due_date", before: null, after: stored.dueDate },
      ],
      attachments: snapshots.map(({ assetId, filename, sizeBytes }) => ({
        assetId,
        filename,
        sizeBytes,
      })),
    }
  } else {
    const currentRows = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, context.organizationId),
          eq(issues.id, input.issue.issueId)
        )
      )
      .limit(1)
    const current = currentRows[0]
    if (!current) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    if (current.revision !== input.issue.expectedRevision) {
      throw publicErrors.conflict("Issue revision changed", {
        reason: "stale_revision",
        resource: "issue",
      })
    }
    targetId = current.id
    targetRevision = current.revision
    if (input.kind === "delete_issue") {
      safeStoredParse(deleteIssueActionPayloadModel, input.issue)
      if (context.role === "member" && current.creatorId !== context.userId) {
        throw publicErrors.forbidden("Only the creator or an admin can delete")
      }
      normalizedPayload = {
        requestFingerprint,
        issueId: current.id,
        expectedRevision: current.revision,
      } satisfies StoredDeleteIssuePayload
      preview = {
        kind: input.kind,
        destructive: true,
        title: current.title,
        issueNumber: current.number,
        issueRevision: current.revision,
        fields: [],
        attachments: [],
      }
    } else {
      const issue = safeStoredParse(updateIssueActionPayloadModel, input.issue)
      const changeKeys = [
        "title",
        "description",
        "status",
        "priority",
        "assigneeId",
        "labels",
        "dueDate",
      ] as const
      if (!changeKeys.some((key) => Object.hasOwn(issue, key))) {
        throw publicErrors.validation("No issue changes provided")
      }
      const labels =
        issue.labels === undefined
          ? undefined
          : await canonicalizeLabels(tx, context.organizationId, issue.labels)
      const beforeAssignee = await readAssigneeName(tx, {
        assigneeId: current.assigneeId,
        organizationId: context.organizationId,
      })
      const afterAssignee = await resolveAssigneeName(tx, {
        assigneeId: issue.assigneeId,
        organizationId: context.organizationId,
      })
      const changes: StoredUpdateIssuePayload["changes"] = {
        ...(issue.title === undefined ? {} : { title: issue.title }),
        ...(issue.description === undefined
          ? {}
          : { description: issue.description.trim() }),
        ...(issue.status === undefined ? {} : { status: issue.status }),
        ...(issue.priority === undefined ? {} : { priority: issue.priority }),
        ...(issue.assigneeId === undefined
          ? {}
          : { assigneeId: issue.assigneeId }),
        ...(labels === undefined ? {} : { labels }),
        ...(issue.dueDate === undefined
          ? {}
          : { dueDate: normalizeDueDate(issue.dueDate) }),
      }
      normalizedPayload = {
        requestFingerprint,
        issueId: current.id,
        expectedRevision: current.revision,
        changes,
      } satisfies StoredUpdateIssuePayload
      const fieldPreview: AgentIssueActionPreview["fields"] = []
      if (changes.title !== undefined) {
        fieldPreview.push({
          field: "title",
          before: current.title,
          after: changes.title,
        })
      }
      if (changes.description !== undefined) {
        fieldPreview.push({
          field: "description",
          before: current.description,
          after: changes.description,
        })
      }
      if (changes.status !== undefined) {
        fieldPreview.push({
          field: "status",
          before: current.status,
          after: changes.status,
        })
      }
      if (changes.priority !== undefined) {
        fieldPreview.push({
          field: "priority",
          before: current.priority,
          after: changes.priority,
        })
      }
      if (Object.hasOwn(changes, "assigneeId")) {
        fieldPreview.push({
          field: "assignee",
          before: beforeAssignee,
          after: afterAssignee ?? null,
        })
      }
      if (changes.labels !== undefined) {
        fieldPreview.push({
          field: "labels",
          before: current.labels,
          after: changes.labels,
        })
      }
      if (Object.hasOwn(changes, "dueDate")) {
        fieldPreview.push({
          field: "due_date",
          before: current.dueDate?.toISOString() ?? null,
          after: changes.dueDate ?? null,
        })
      }
      preview = {
        kind: input.kind,
        destructive: false,
        title: current.title,
        issueNumber: current.number,
        issueRevision: current.revision,
        fields: fieldPreview,
        attachments: [],
      }
    }
  }

  await reserveRootWrite(tx, context)
  return persistPreparedAction(tx, {
    context,
    kind: input.kind,
    targetId,
    targetRevision,
    normalizedPayload,
    preview,
    snapshots,
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    now,
  })
}

export const prepareCreateIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentCreateIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "create_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (isActiveAssetLeaseConflict(cause)) {
          throw publicErrors.conflict(
            "Agent attachment is already reserved by another action",
            {
              reason: "asset_lease_conflict",
              resource: "agent_asset",
            }
          )
        }
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareCreateIssueAction")
      }
    }
    throw new Error("Agent create action retry exhausted")
  })

export const prepareUpdateIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentUpdateIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "update_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareUpdateIssueAction")
      }
    }
    throw new Error("Agent update action retry exhausted")
  })

export const prepareDeleteIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentDeleteIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "delete_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareDeleteIssueAction")
      }
    }
    throw new Error("Agent delete action retry exhausted")
  })

const requireActionForGrant = async (
  tx: AgentTransaction,
  context: ValidGrant,
  actionId: string
) => {
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, actionId),
        eq(agentActions.organizationId, context.organizationId),
        eq(agentActions.threadId, context.threadId),
        eq(agentActions.sessionId, context.sessionId),
        eq(agentActions.userId, context.userId),
        eq(agentActions.contextEpoch, context.contextEpoch)
      )
    )
    .limit(1)
  const action = rows[0]
  if (!action) {
    throw publicErrors.notFound("Agent action not found", {
      resource: "agent_action",
    })
  }
  return action
}

export const getAgentIssueActionDecision = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date }
): Promise<AgentIssueAction> => {
  try {
    const action = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash: await hashAgentToken(input.grant),
        kind: "run",
        now,
      })
      return requireActionForGrant(tx, context, input.actionId)
    })
    return toActionDto(action)
  } catch (cause) {
    return preserveAgentActionError(cause, "getAgentIssueActionDecision")
  }
}

const requirePublicAction = async (
  tx: AgentTransaction,
  input: { actionId: string; sessionId: string; userId: string; now: Date }
) => {
  const live = await requireLiveSession(tx, input)
  await requireActiveMembership(tx, live)
  const context = await ensureAgentSessionContextInTransaction(tx, input)
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, input.actionId),
        eq(agentActions.organizationId, live.activeOrganizationId),
        eq(agentActions.sessionId, input.sessionId),
        eq(agentActions.userId, input.userId),
        eq(agentActions.contextEpoch, context.contextEpoch)
      )
    )
    .limit(1)
  const action = rows[0]
  if (!action) {
    throw publicErrors.notFound("Agent action not found", {
      resource: "agent_action",
    })
  }
  await requireOwnedThread(tx, {
    threadId: action.threadId,
    userId: input.userId,
    activeOrganizationId: live.activeOrganizationId,
  })
  return action
}

export const getAgentActionForSession = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string; now?: Date }
): Promise<AgentIssueAction> => {
  try {
    const action = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requirePublicAction(tx, { ...input, now })
      if (
        (current.status === "pending" || current.status === "approved") &&
        current.expiresAt.getTime() <= now.getTime()
      ) {
        const rows = await tx
          .update(agentActions)
          .set({ status: "expired", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentActions.organizationId, current.organizationId),
              eq(agentActions.id, current.id),
              inArray(agentActions.status, ["pending", "approved"])
            )
          )
          .returning()
        return rows[0] ?? current
      }
      return current
    })
    return toActionDto(action)
  } catch (cause) {
    return preserveAgentActionError(cause, "getAgentActionForSession")
  }
}

type DecideAgentActionInput = {
  actionId: string
  decision: "yes" | "no"
  idempotencyKey: string
  sessionId: string
  userId: string
  now?: Date
}

const decideAgentActionForSessionWithRetry = async (
  db: Db,
  input: DecideAgentActionInput,
  attempt = 0
): Promise<AgentIssueAction> => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const action = await requirePublicAction(tx, { ...input, now })
      const desiredStatus = input.decision === "yes" ? "approved" : "rejected"
      const decisionKeyRows = await tx
        .select({ id: agentActions.id })
        .from(agentActions)
        .where(
          and(
            eq(agentActions.organizationId, action.organizationId),
            eq(agentActions.decisionIdempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1)
      if (decisionKeyRows[0] && decisionKeyRows[0].id !== action.id) {
        throw publicErrors.conflict(
          "Agent decision idempotency key is already in use",
          {
            reason: "idempotency_conflict",
            resource: "agent_action",
          }
        )
      }
      const repeatedDecision =
        action.decisionProvenance === "manual" &&
        action.decisionIdempotencyKey === input.idempotencyKey &&
        (input.decision === "yes"
          ? action.status !== "rejected"
          : action.status === "rejected")
      if (repeatedDecision) {
        return { action, expired: false }
      }
      if (action.status !== "pending" || action.decisionProvenance !== null) {
        throw publicErrors.conflict("Agent action was already decided", {
          reason: "decision_conflict",
          resource: "agent_action",
        })
      }
      if (action.expiresAt.getTime() <= now.getTime()) {
        const rows = await tx
          .update(agentActions)
          .set({ status: "expired", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentActions.organizationId, action.organizationId),
              eq(agentActions.id, action.id),
              eq(agentActions.status, "pending")
            )
          )
          .returning()
        return { action: rows[0] ?? action, expired: true }
      }
      const rows = await tx
        .update(agentActions)
        .set({
          status: desiredStatus,
          decisionProvenance: "manual",
          decisionIdempotencyKey: input.idempotencyKey,
          decidedAt: now,
          completedAt: input.decision === "no" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentActions.organizationId, action.organizationId),
            eq(agentActions.id, action.id),
            eq(agentActions.status, "pending"),
            isNull(agentActions.decisionProvenance)
          )
        )
        .returning()
      const decided = rows[0]
      if (!decided) {
        throw new AgentActionWriteRaceError(
          "Agent decision changed concurrently"
        )
      }
      if (input.decision === "no") {
        await tx
          .update(agentRuns)
          .set({ status: "canceled", finishedAt: now })
          .where(
            and(
              eq(agentRuns.organizationId, action.organizationId),
              eq(agentRuns.id, action.runId),
              eq(agentRuns.status, "waiting_approval")
            )
          )
      }
      return { action: decided, expired: false }
    })
    if (outcome.expired) {
      throw publicErrors.conflict("Agent action expired", {
        reason: "action_expired",
        resource: "agent_action",
      })
    }
    return toActionDto(outcome.action)
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return decideAgentActionForSessionWithRetry(db, input, attempt + 1)
    }
    return preserveAgentActionError(cause, "decideAgentActionForSession")
  }
}

export const decideAgentActionForSession = async (
  db: Db,
  input: DecideAgentActionInput
): Promise<AgentIssueAction> =>
  withAgentActionLock(`action:${input.actionId}`, () =>
    decideAgentActionForSessionWithRetry(db, input)
  )

export const issueAgentActionResumeTicket = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string; now?: Date }
): Promise<AgentResumeTicket> => {
  const credential = await createAgentToken()
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const action = await requirePublicAction(tx, { ...input, now })
      if (
        action.status !== "approved" ||
        action.decisionProvenance !== "manual" ||
        action.expiresAt.getTime() <= now.getTime()
      ) {
        throw publicErrors.conflict("Agent action cannot be resumed", {
          reason: "action_not_approved",
          resource: "agent_action",
        })
      }
      await tx
        .update(agentResumeTickets)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentResumeTickets.organizationId, action.organizationId),
            eq(agentResumeTickets.actionId, action.id),
            isNull(agentResumeTickets.consumedAt),
            isNull(agentResumeTickets.revokedAt)
          )
        )
      const expiresAt = new Date(
        Math.min(
          now.getTime() + AGENT_RESUME_TICKET_MAX_LIFETIME_MS,
          action.expiresAt.getTime()
        )
      )
      if (expiresAt.getTime() <= now.getTime()) {
        throw publicErrors.conflict("Agent action expired", {
          reason: "action_expired",
          resource: "agent_action",
        })
      }
      await tx.insert(agentResumeTickets).values({
        id: crypto.randomUUID(),
        tokenHash: credential.tokenHash,
        actionId: action.id,
        organizationId: action.organizationId,
        threadId: action.threadId,
        sessionId: action.sessionId,
        userId: action.userId,
        contextEpoch: action.contextEpoch,
        issuedAt: now,
        expiresAt,
      })
      return { ticket: credential.token, expiresAt: expiresAt.toISOString() }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "issueAgentActionResumeTicket")
  }
}

export const resumeAgentApprovedAction = async (
  db: Db,
  input: { actionId: string; resumeTicket: string; now?: Date }
): Promise<AgentRunGrant> => {
  const [ticketHash, runCredential] = await Promise.all([
    hashAgentToken(input.resumeTicket),
    createAgentToken(),
  ])
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const tickets = await tx
        .update(agentResumeTickets)
        .set({ consumedAt: now })
        .where(
          and(
            eq(agentResumeTickets.tokenHash, ticketHash),
            eq(agentResumeTickets.actionId, input.actionId),
            isNull(agentResumeTickets.consumedAt),
            isNull(agentResumeTickets.revokedAt),
            gt(agentResumeTickets.expiresAt, now)
          )
        )
        .returning()
      const ticket = tickets[0]
      if (!ticket) {
        throw publicErrors.unauthorized("Agent resume ticket is invalid")
      }
      const live = await requireLiveSession(tx, {
        sessionId: ticket.sessionId,
        userId: ticket.userId,
        now,
      })
      if (live.activeOrganizationId !== ticket.organizationId) {
        throw publicErrors.activeOrganizationMismatch()
      }
      await requireActiveMembership(tx, live)
      await requireOwnedThread(tx, {
        threadId: ticket.threadId,
        userId: ticket.userId,
        activeOrganizationId: ticket.organizationId,
      })
      const context = await ensureAgentSessionContextInTransaction(tx, {
        sessionId: ticket.sessionId,
        userId: ticket.userId,
        now,
      })
      if (context.contextEpoch !== ticket.contextEpoch) {
        throw publicErrors.unauthorized("Agent resume ticket is invalid")
      }
      const actionRows = await tx
        .select()
        .from(agentActions)
        .where(
          and(
            eq(agentActions.organizationId, ticket.organizationId),
            eq(agentActions.id, ticket.actionId),
            eq(agentActions.threadId, ticket.threadId),
            eq(agentActions.sessionId, ticket.sessionId),
            eq(agentActions.userId, ticket.userId),
            eq(agentActions.contextEpoch, ticket.contextEpoch)
          )
        )
        .limit(1)
      const action = actionRows[0]
      if (
        !action ||
        action.status !== "approved" ||
        action.decisionProvenance !== "manual" ||
        action.expiresAt.getTime() <= now.getTime()
      ) {
        throw publicErrors.conflict("Agent action cannot be resumed", {
          reason: "action_not_approved",
          resource: "agent_action",
        })
      }
      const activeContinuation = await tx
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.organizationId, action.organizationId),
            eq(agentRuns.resumedActionId, action.id),
            inArray(agentRuns.status, ["running", "waiting_approval"]),
            gt(agentRuns.expiresAt, now)
          )
        )
        .limit(1)
      if (activeContinuation[0]) {
        throw publicErrors.conflict("Agent action already has a continuation", {
          reason: "resume_in_progress",
          resource: "agent_action",
        })
      }
      const originRows = await tx
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.organizationId, action.organizationId),
            eq(agentRuns.id, action.runId),
            eq(agentRuns.threadId, action.threadId),
            eq(agentRuns.sessionId, action.sessionId),
            eq(agentRuns.userId, action.userId),
            eq(agentRuns.contextEpoch, action.contextEpoch)
          )
        )
        .limit(1)
      const origin = originRows[0]
      if (!origin) throw new Error("Agent action origin run is missing")

      const runId = crypto.randomUUID()
      const expiresAt = new Date(
        Math.min(
          now.getTime() + ACTION_RESUME_RUN_TTL_MS,
          action.expiresAt.getTime()
        )
      )
      await tx.insert(agentRuns).values({
        id: runId,
        organizationId: action.organizationId,
        threadId: action.threadId,
        rootRunId: origin.rootRunId,
        parentRunId: origin.id,
        resumedActionId: action.id,
        sessionId: action.sessionId,
        userId: action.userId,
        contextEpoch: action.contextEpoch,
        status: "running",
        scope: "action_resume",
        startedAt: now,
        expiresAt,
      })
      await tx
        .update(agentRuns)
        .set({ status: "completed", finishedAt: now })
        .where(
          and(
            eq(agentRuns.organizationId, origin.organizationId),
            eq(agentRuns.id, origin.id),
            eq(agentRuns.status, "waiting_approval")
          )
        )
      const grantExpiresAt = await createGrantInTransaction(tx, {
        tokenHash: runCredential.tokenHash,
        kind: "run",
        organizationId: action.organizationId,
        threadId: action.threadId,
        runId,
        sessionId: action.sessionId,
        userId: action.userId,
        contextEpoch: action.contextEpoch,
        now,
        expiresAt,
      })
      return {
        runId,
        rootRunId: origin.rootRunId,
        grant: runCredential.token,
        expiresAt: grantExpiresAt.toISOString(),
      }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "resumeAgentApprovedAction")
  }
}

const policyPermissions = (
  mode: AgentApprovalPolicyMode
): AgentApprovalPolicy["permissions"] => ({
  createIssue: mode !== "ask_each",
  updateIssue: mode !== "ask_each",
  deleteIssue: mode === "auto_all",
})

const defaultPolicy = (): AgentApprovalPolicy => ({
  mode: "ask_each",
  expiresAt: null,
  permissions: policyPermissions("ask_each"),
})

const requirePolicyScope = async (
  tx: AgentTransaction,
  input: { sessionId: string; userId: string; threadId: string; now: Date }
) => {
  const live = await requireLiveSession(tx, input)
  await requireActiveMembership(tx, live)
  await requireOwnedThread(tx, {
    threadId: input.threadId,
    userId: input.userId,
    activeOrganizationId: live.activeOrganizationId,
  })
  const context = await ensureAgentSessionContextInTransaction(tx, input)
  return { live, context }
}

export const getAgentApprovalPolicyForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
): Promise<AgentApprovalPolicy> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const { context, live } = await requirePolicyScope(tx, { ...input, now })
      const rows = await tx
        .select()
        .from(agentApprovalPolicies)
        .where(
          and(
            eq(agentApprovalPolicies.organizationId, live.activeOrganizationId),
            eq(agentApprovalPolicies.threadId, input.threadId),
            eq(agentApprovalPolicies.sessionId, input.sessionId),
            eq(agentApprovalPolicies.userId, input.userId),
            eq(agentApprovalPolicies.contextEpoch, context.contextEpoch),
            isNull(agentApprovalPolicies.revokedAt)
          )
        )
        .limit(1)
      const policy = rows[0]
      if (!policy) return defaultPolicy()
      if (policy.expiresAt.getTime() <= now.getTime()) {
        await tx
          .update(agentApprovalPolicies)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentApprovalPolicies.id, policy.id),
              isNull(agentApprovalPolicies.revokedAt)
            )
          )
        return defaultPolicy()
      }
      return {
        mode: policy.mode,
        expiresAt: policy.expiresAt.toISOString(),
        permissions: policyPermissions(policy.mode),
      }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "getAgentApprovalPolicyForSession")
  }
}

export const deleteAgentApprovalPolicyForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
): Promise<AgentApprovalPolicy> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const { context, live } = await requirePolicyScope(tx, { ...input, now })
      await tx
        .update(agentApprovalPolicies)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(agentApprovalPolicies.organizationId, live.activeOrganizationId),
            eq(agentApprovalPolicies.threadId, input.threadId),
            eq(agentApprovalPolicies.sessionId, input.sessionId),
            eq(agentApprovalPolicies.userId, input.userId),
            eq(agentApprovalPolicies.contextEpoch, context.contextEpoch),
            isNull(agentApprovalPolicies.revokedAt)
          )
        )
      return defaultPolicy()
    })
  } catch (cause) {
    return preserveAgentActionError(
      cause,
      "deleteAgentApprovalPolicyForSession"
    )
  }
}

export const putAgentApprovalPolicyForSession = async (
  db: Db,
  input: {
    sessionId: string
    userId: string
    threadId: string
    mode: AgentApprovalPolicyMode
    expiresInSeconds: number
    destructiveConfirmation?: "ALLOW_ISSUE_DELETE"
    now?: Date
  }
): Promise<AgentApprovalPolicy> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      if (
        input.mode === "auto_all" &&
        input.destructiveConfirmation !== "ALLOW_ISSUE_DELETE"
      ) {
        throw publicErrors.confirmationRequired("agent.enable_auto_delete", {
          reason: "destructive_confirmation_required",
        })
      }
      if (
        input.mode !== "auto_all" &&
        input.destructiveConfirmation !== undefined
      ) {
        throw publicErrors.validation("Unexpected destructive confirmation", {
          field: "destructiveConfirmation",
        })
      }
      const { context, live } = await requirePolicyScope(tx, { ...input, now })
      await tx
        .update(agentApprovalPolicies)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(agentApprovalPolicies.organizationId, live.activeOrganizationId),
            eq(agentApprovalPolicies.threadId, input.threadId),
            eq(agentApprovalPolicies.sessionId, input.sessionId),
            eq(agentApprovalPolicies.userId, input.userId),
            isNull(agentApprovalPolicies.revokedAt)
          )
        )
      const expiresAt = new Date(
        now.getTime() +
          Math.min(input.expiresInSeconds * 1000, AGENT_ACTION_MAX_LIFETIME_MS)
      )
      await tx.insert(agentApprovalPolicies).values({
        id: crypto.randomUUID(),
        organizationId: live.activeOrganizationId,
        threadId: input.threadId,
        sessionId: input.sessionId,
        userId: input.userId,
        contextEpoch: context.contextEpoch,
        mode: input.mode,
        destructiveConfirmedAt: input.mode === "auto_all" ? now : null,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      })
      return {
        mode: input.mode,
        expiresAt: expiresAt.toISOString(),
        permissions: policyPermissions(input.mode),
      }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "putAgentApprovalPolicyForSession")
  }
}

const parseStoredPayload = (action: ActionRow): StoredPayload => {
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
        action.normalizedPayload
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

const executionResult = (
  action: ActionRow,
  receiptValue: unknown
): AgentActionExecutionResult => {
  const receipt = safeStoredParse(storedReceiptModel, receiptValue)
  return {
    actionId: action.id,
    kind: action.kind,
    status: "succeeded",
    issue: {
      id: receipt.issueId,
      number: receipt.number,
      revision: receipt.revision,
      deleted: receipt.deleted,
    },
  }
}

const markActionConflict = async (
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

const validateExecutionAssets = async (
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

const executeAgentApprovedActionWithRetry = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date },
  attempt = 0
): Promise<AgentActionExecutionResult> => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash: await hashAgentToken(input.grant),
        kind: "run",
        now,
      })
      const action = await requireActionForGrant(tx, context, input.actionId)
      if (action.status === "succeeded") {
        return {
          result: executionResult(action, action.receipt),
          conflict: null,
        }
      }
      if (action.status !== "approved") {
        throw publicErrors.conflict("Agent action is not approved", {
          reason: "action_not_approved",
          resource: "agent_action",
        })
      }
      if (
        action.decisionProvenance !== "manual" &&
        action.decisionProvenance !== "auto_policy"
      ) {
        throw new Error("Approved agent action has no decision provenance")
      }
      const correctRun =
        action.decisionProvenance === "manual"
          ? context.runScope === "action_resume" &&
            context.resumedActionId === action.id
          : context.runScope === "chat" && context.runId === action.runId
      if (!correctRun) {
        throw publicErrors.unauthorized("Agent capability is invalid")
      }
      if (action.expiresAt.getTime() <= now.getTime()) {
        await tx
          .update(agentActions)
          .set({ status: "expired", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentActions.organizationId, action.organizationId),
              eq(agentActions.id, action.id),
              eq(agentActions.status, "approved")
            )
          )
        return { result: null, conflict: "action_expired" }
      }
      const claimed = await tx
        .update(agentActions)
        .set({
          attempt: sql`${agentActions.attempt} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentActions.organizationId, action.organizationId),
            eq(agentActions.id, action.id),
            eq(agentActions.status, "approved"),
            eq(agentActions.attempt, action.attempt)
          )
        )
        .returning({ id: agentActions.id })
      if (!claimed[0]) {
        throw new AgentActionWriteRaceError(
          "Agent action execution changed concurrently"
        )
      }
      const stored = parseStoredPayload(action)
      const currentRows = await tx
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.organizationId, action.organizationId),
            eq(issues.id, action.targetId)
          )
        )
        .limit(1)
      const current = currentRows[0]
      if (
        action.kind === "create_issue"
          ? current !== undefined
          : !current || current.revision !== action.targetRevision
      ) {
        await markActionConflict(tx, action, now, "stale_revision")
        return { result: null, conflict: "stale_revision" }
      }

      const auditContext = {
        source: "agent" as const,
        approvalMode: action.decisionProvenance,
        actionId: action.id,
      }
      let receipt: v.InferOutput<typeof storedReceiptModel>
      if (stored.kind === "create_issue") {
        if (
          !(await isAssigneeMember(tx, {
            assigneeId: stored.value.assigneeId,
            organizationId: action.organizationId,
          }))
        ) {
          await markActionConflict(tx, action, now, "assignee_changed")
          return { result: null, conflict: "assignee_changed" }
        }
        const canonicalLabels = await canonicalizeLabels(
          tx,
          action.organizationId,
          stored.value.labels
        )
        if (
          JSON.stringify(canonicalLabels) !==
          JSON.stringify(stored.value.labels)
        ) {
          await markActionConflict(tx, action, now, "labels_changed")
          return { result: null, conflict: "labels_changed" }
        }
        if (
          !(await validateExecutionAssets(
            tx,
            action,
            now,
            stored.value.attachments.map(({ assetId }) => assetId)
          ))
        ) {
          await markActionConflict(tx, action, now, "asset_snapshot_changed")
          return { result: null, conflict: "asset_snapshot_changed" }
        }
        const created = await insertIssueInTransaction(tx, {
          id: action.targetId,
          organizationId: action.organizationId,
          creatorId: action.userId,
          title: stored.value.title,
          description: stored.value.description,
          status: stored.value.status,
          priority: stored.value.priority,
          assigneeId: stored.value.assigneeId,
          labels: stored.value.labels,
          dueDate: parseDueDate(stored.value.dueDate) ?? null,
          now,
          auditContext,
        })
        for (const attachment of stored.value.attachments) {
          // oxlint-disable-next-line no-await-in-loop -- promotion triggerの固定順を同一transaction内でassetごとに完了させる。
          await promoteAgentAssetToIssueFileInTransaction(tx, {
            actionId: action.id,
            actorUserId: action.userId,
            assetId: attachment.assetId,
            issueId: created.id,
            now,
            organizationId: action.organizationId,
            plannedFileId: attachment.fileId,
          })
        }
        receipt = {
          issueId: created.id,
          number: created.number,
          revision: created.revision,
          deleted: false,
        }
      } else if (stored.kind === "update_issue") {
        if (
          Object.hasOwn(stored.value.changes, "assigneeId") &&
          !(await isAssigneeMember(tx, {
            assigneeId: stored.value.changes.assigneeId,
            organizationId: action.organizationId,
          }))
        ) {
          await markActionConflict(tx, action, now, "assignee_changed")
          return { result: null, conflict: "assignee_changed" }
        }
        if (stored.value.changes.labels !== undefined) {
          const canonicalLabels = await canonicalizeLabels(
            tx,
            action.organizationId,
            stored.value.changes.labels
          )
          if (
            JSON.stringify(canonicalLabels) !==
            JSON.stringify(stored.value.changes.labels)
          ) {
            await markActionConflict(tx, action, now, "labels_changed")
            return { result: null, conflict: "labels_changed" }
          }
        }
        const updated = await updateIssueInTransaction(tx, {
          id: stored.value.issueId,
          actorUserId: action.userId,
          organizationId: action.organizationId,
          expectedRevision: stored.value.expectedRevision,
          ...stored.value.changes,
          dueDate: parseDueDate(stored.value.changes.dueDate),
          now,
          auditContext,
        })
        if (!updated) {
          await markActionConflict(tx, action, now, "stale_revision")
          return { result: null, conflict: "stale_revision" }
        }
        receipt = {
          issueId: updated.id,
          number: updated.number,
          revision: updated.revision,
          deleted: false,
        }
      } else {
        if (
          context.role === "member" &&
          current?.creatorId !== context.userId
        ) {
          await markActionConflict(tx, action, now, "delete_permission_changed")
          return { result: null, conflict: "delete_permission_changed" }
        }
        const deleted = await deleteIssueInTransaction(tx, {
          id: stored.value.issueId,
          actorUserId: action.userId,
          organizationId: action.organizationId,
          expectedRevision: stored.value.expectedRevision,
          now,
          auditContext,
        })
        if (!deleted) {
          await markActionConflict(tx, action, now, "stale_revision")
          return { result: null, conflict: "stale_revision" }
        }
        receipt = {
          issueId: deleted.id,
          number: deleted.number,
          revision: deleted.revision,
          deleted: true,
        }
      }
      const succeededRows = await tx
        .update(agentActions)
        .set({
          status: "succeeded",
          receipt,
          resultId: action.targetId,
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
      const succeeded = succeededRows[0]
      if (!succeeded) throw new Error("Agent action success transition lost")
      return {
        result: executionResult(succeeded, receipt),
        conflict: null,
      }
    })
    if (outcome.conflict) {
      throw publicErrors.conflict("Agent action must be prepared again", {
        reason: outcome.conflict,
        resource: "agent_action",
      })
    }
    if (!outcome.result) throw new Error("Agent action returned no result")
    return outcome.result
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return executeAgentApprovedActionWithRetry(db, input, attempt + 1)
    }
    return preserveAgentActionError(cause, "executeAgentApprovedAction")
  }
}

const readAgentExecutionOrganizationForLock = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date },
  attempt = 0
): Promise<string | null> => {
  try {
    const rows = await db
      .select({ organizationId: agentGrants.organizationId })
      .from(agentGrants)
      .where(
        and(
          eq(agentGrants.tokenHash, await hashAgentToken(input.grant)),
          eq(agentGrants.kind, "run")
        )
      )
      .limit(1)
    return rows[0]?.organizationId ?? null
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return readAgentExecutionOrganizationForLock(db, input, attempt + 1)
    }
    return preserveAgentActionError(
      cause,
      "readAgentExecutionOrganizationForLock"
    )
  }
}

export const executeAgentApprovedAction = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date }
): Promise<AgentActionExecutionResult> =>
  withAgentActionLock(`action:${input.actionId}`, async () => {
    const organizationId = await readAgentExecutionOrganizationForLock(
      db,
      input
    )

    const execute = () => executeAgentApprovedActionWithRetry(db, input)

    return organizationId
      ? withAgentActionLock(`issue-write:${organizationId}`, execute)
      : execute()
  })

export const sweepAgentActions = async (
  db: Db,
  now = new Date()
): Promise<{ expired: number; scrubbed: number }> => {
  try {
    return await db.transaction(async (tx) => {
      const dueOrganizations = await tx
        .select({ organizationId: agentActions.organizationId })
        .from(agentActions)
        .where(
          and(
            inArray(agentActions.status, ["pending", "approved"]),
            lte(agentActions.expiresAt, now)
          )
        )
        .groupBy(agentActions.organizationId)
      let expired = 0
      for (const { organizationId } of dueOrganizations) {
        // oxlint-disable-next-line no-await-in-loop -- maintenanceでもtenantごとのupdate fenceを維持する。
        expired += await expireActionsInTransaction(tx, {
          organizationId,
          now,
        })
      }
      const scrubbedRows = await tx
        .update(agentActions)
        .set({
          normalizedPayload: null,
          canonicalPreview: null,
          scrubbedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            inArray(agentActions.status, [
              "rejected",
              "expired",
              "canceled",
              "succeeded",
              "conflicted",
            ]),
            isNull(agentActions.scrubbedAt),
            lte(
              agentActions.completedAt,
              new Date(now.getTime() - ACTION_TERMINAL_RETENTION_MS)
            )
          )
        )
        .returning({ id: agentActions.id })
      return { expired, scrubbed: scrubbedRows.length }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "sweepAgentActions")
  }
}
