import { agentActions, issues } from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

import type { AgentActionExecutionResult } from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { promoteAgentAssetToIssueFileInTransaction } from "../../files/public"
import {
  deleteIssueInTransaction,
  insertIssueInTransaction,
  updateIssueInTransaction,
} from "../../issues/public"
import { hashAgentToken } from "../crypto"
import {
  validateGrantInTransaction,
  type AgentTransaction,
  type ValidGrant,
} from "../threads/repository"
import { requireActionForGrant } from "./decision-repository"
import {
  markActionConflict,
  parseStoredPayload,
  validateExecutionAssets,
} from "./execution-support"
import { canonicalizeLabels, isAssigneeMember } from "./prepare-read-support"
import {
  AgentActionWriteRaceError,
  executionResult,
  parseDueDate,
  type ActionRow,
  type StoredPayload,
} from "./repository-support"

type IssueRow = typeof issues.$inferSelect
type ApprovedAction = ActionRow & {
  decisionProvenance: "manual" | "auto_policy"
}

type ExecutionReceipt = {
  issueId: string
  number: number
  revision: number
  deleted: boolean
}

type MutationOutcome =
  | { receipt: ExecutionReceipt; conflict: null }
  | { receipt: null; conflict: string }

type ExecutionOutcome = {
  result: AgentActionExecutionResult | null
  conflict: string | null
}

const conflictOutcome = async (
  tx: AgentTransaction,
  action: ActionRow,
  now: Date,
  conflict: string
): Promise<MutationOutcome> => {
  await markActionConflict(tx, action, now, conflict)
  return { receipt: null, conflict }
}

const validateExecutionScope: (
  action: ActionRow,
  context: ValidGrant
) => asserts action is ApprovedAction = (action, context) => {
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
}

const expireActionIfNeeded = async (
  tx: AgentTransaction,
  action: ApprovedAction,
  now: Date
) => {
  if (action.expiresAt.getTime() > now.getTime()) return false
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
  return true
}

const claimActionExecution = async (
  tx: AgentTransaction,
  action: ApprovedAction,
  now: Date
) => {
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
}

const readCurrentIssue = async (
  tx: AgentTransaction,
  action: ActionRow
): Promise<IssueRow | undefined> => {
  const rows = await tx
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, action.organizationId),
        eq(issues.id, action.targetId)
      )
    )
    .limit(1)
  return rows[0]
}

const targetRevisionChanged = (
  action: ActionRow,
  current: IssueRow | undefined
) =>
  action.kind === "create_issue"
    ? current !== undefined
    : !current || current.revision !== action.targetRevision

const createIssueFromAction = async (
  tx: AgentTransaction,
  action: ApprovedAction,
  stored: Extract<StoredPayload, { kind: "create_issue" }>,
  now: Date
): Promise<MutationOutcome> => {
  const assigneeValid = await isAssigneeMember(tx, {
    assigneeId: stored.value.assigneeId,
    organizationId: action.organizationId,
  })
  if (!assigneeValid) {
    return conflictOutcome(tx, action, now, "assignee_changed")
  }
  const canonicalLabels = await canonicalizeLabels(
    tx,
    action.organizationId,
    stored.value.labels
  )
  if (JSON.stringify(canonicalLabels) !== JSON.stringify(stored.value.labels)) {
    return conflictOutcome(tx, action, now, "labels_changed")
  }
  const assetsValid = await validateExecutionAssets(
    tx,
    action,
    now,
    stored.value.attachments.map(({ assetId }) => assetId)
  )
  if (!assetsValid) {
    return conflictOutcome(tx, action, now, "asset_snapshot_changed")
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
    auditContext: {
      source: "agent",
      approvalMode: action.decisionProvenance,
      actionId: action.id,
    },
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
  return {
    receipt: {
      issueId: created.id,
      number: created.number,
      revision: created.revision,
      deleted: false,
    },
    conflict: null,
  }
}

const updateIssueFromAction = async (
  tx: AgentTransaction,
  action: ApprovedAction,
  stored: Extract<StoredPayload, { kind: "update_issue" }>,
  now: Date
): Promise<MutationOutcome> => {
  if (Object.hasOwn(stored.value.changes, "assigneeId")) {
    const assigneeValid = await isAssigneeMember(tx, {
      assigneeId: stored.value.changes.assigneeId,
      organizationId: action.organizationId,
    })
    if (!assigneeValid) {
      return conflictOutcome(tx, action, now, "assignee_changed")
    }
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
      return conflictOutcome(tx, action, now, "labels_changed")
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
    auditContext: {
      source: "agent",
      approvalMode: action.decisionProvenance,
      actionId: action.id,
    },
  })
  if (!updated) {
    return conflictOutcome(tx, action, now, "stale_revision")
  }
  return {
    receipt: {
      issueId: updated.id,
      number: updated.number,
      revision: updated.revision,
      deleted: false,
    },
    conflict: null,
  }
}

const deleteIssueFromAction = async (
  tx: AgentTransaction,
  action: ApprovedAction,
  stored: Extract<StoredPayload, { kind: "delete_issue" }>,
  current: IssueRow | undefined,
  context: ValidGrant,
  now: Date
): Promise<MutationOutcome> => {
  if (context.role === "member" && current?.creatorId !== context.userId) {
    return conflictOutcome(tx, action, now, "delete_permission_changed")
  }
  const deleted = await deleteIssueInTransaction(tx, {
    id: stored.value.issueId,
    actorUserId: action.userId,
    organizationId: action.organizationId,
    expectedRevision: stored.value.expectedRevision,
    now,
    auditContext: {
      source: "agent",
      approvalMode: action.decisionProvenance,
      actionId: action.id,
    },
  })
  if (!deleted) {
    return conflictOutcome(tx, action, now, "stale_revision")
  }
  return {
    receipt: {
      issueId: deleted.id,
      number: deleted.number,
      revision: deleted.revision,
      deleted: true,
    },
    conflict: null,
  }
}

const executeStoredAction = (
  tx: AgentTransaction,
  input: {
    action: ApprovedAction
    stored: StoredPayload
    current: IssueRow | undefined
    context: ValidGrant
    now: Date
  }
) => {
  if (input.stored.kind === "create_issue") {
    return createIssueFromAction(tx, input.action, input.stored, input.now)
  }
  if (input.stored.kind === "update_issue") {
    return updateIssueFromAction(tx, input.action, input.stored, input.now)
  }
  return deleteIssueFromAction(
    tx,
    input.action,
    input.stored,
    input.current,
    input.context,
    input.now
  )
}

const persistExecutionSuccess = async (
  tx: AgentTransaction,
  action: ActionRow,
  receipt: ExecutionReceipt,
  now: Date
) => {
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
  return executionResult(succeeded, receipt)
}

export const executeAgentApprovedActionInTransaction = async (
  tx: AgentTransaction,
  input: { grant: string; actionId: string; now?: Date }
): Promise<ExecutionOutcome> => {
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
  validateExecutionScope(action, context)
  if (await expireActionIfNeeded(tx, action, now)) {
    return { result: null, conflict: "action_expired" }
  }
  await claimActionExecution(tx, action, now)
  const stored = parseStoredPayload(action)
  const current = await readCurrentIssue(tx, action)
  if (targetRevisionChanged(action, current)) {
    await markActionConflict(tx, action, now, "stale_revision")
    return { result: null, conflict: "stale_revision" }
  }
  const mutation = await executeStoredAction(tx, {
    action,
    stored,
    current,
    context,
    now,
  })
  if (mutation.receipt === null) {
    return { result: null, conflict: mutation.conflict }
  }
  return {
    result: await persistExecutionSuccess(tx, action, mutation.receipt, now),
    conflict: null,
  }
}
