import {
  files,
  issueFileOwners,
  issues,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray } from "drizzle-orm"

import type { AgentActionExecutionResult } from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import {
  deleteReadyFilesInTransaction,
  promoteAgentAssetToIssueFileInTransaction,
  type FileWithOwner,
} from "../../files/public"
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
  claimActionExecution,
  expireActionIfNeeded,
  persistExecutionSuccess,
  type ExecutionReceipt,
} from "./execution-state"
import {
  markActionConflict,
  parseStoredPayload,
  validateExecutionAssets,
} from "./execution-support"
import { canonicalizeLabels, isAssigneeMember } from "./prepare-read-support"
import {
  executionResult,
  parseDueDate,
  type ActionRow,
  type StoredPayload,
} from "./repository-support"

type IssueRow = typeof issues.$inferSelect
type ApprovedAction = ActionRow & {
  decisionProvenance: "manual" | "auto_policy"
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
  if (stored.value.operation === "add_attachments") {
    const assetsValid = await validateExecutionAssets(
      tx,
      action,
      now,
      stored.value.attachments.map(({ assetId }) => assetId)
    )
    if (!assetsValid) {
      return conflictOutcome(tx, action, now, "asset_snapshot_changed")
    }
    const updated = await updateIssueInTransaction(tx, {
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
    if (!updated) return conflictOutcome(tx, action, now, "stale_revision")
    for (const attachment of stored.value.attachments) {
      // oxlint-disable-next-line no-await-in-loop -- promotion and Issue revision must remain in one deterministic transaction.
      await promoteAgentAssetToIssueFileInTransaction(tx, {
        actionId: action.id,
        actorUserId: action.userId,
        assetId: attachment.assetId,
        issueId: updated.id,
        now,
        organizationId: action.organizationId,
        plannedFileId: attachment.fileId,
      })
    }
    return {
      receipt: {
        issueId: updated.id,
        number: updated.number,
        revision: updated.revision,
        deleted: false,
        attachmentMutation: {
          operation: "added",
          fileIds: stored.value.attachments.map(({ fileId }) => fileId),
        },
      },
      conflict: null,
    }
  }
  if (stored.value.operation === "remove_attachments") {
    const rows = await tx
      .select({ stored: files, ownerId: issueFileOwners.issueId })
      .from(files)
      .innerJoin(
        issueFileOwners,
        and(
          eq(issueFileOwners.organizationId, files.organizationId),
          eq(issueFileOwners.fileId, files.id),
          eq(issueFileOwners.ownerType, "issue"),
          eq(issueFileOwners.issueId, stored.value.issueId)
        )
      )
      .where(
        and(
          eq(files.organizationId, action.organizationId),
          eq(files.status, "ready"),
          inArray(files.id, stored.value.fileIds)
        )
      )
    if (rows.length !== stored.value.fileIds.length) {
      return conflictOutcome(tx, action, now, "attachment_snapshot_changed")
    }
    const byId = new Map(rows.map((row) => [row.stored.id, row]))
    const ordered: FileWithOwner[] = stored.value.fileIds.map((fileId) => {
      const row = byId.get(fileId)
      if (!row) throw new Error("Attachment execution ordering failed")
      return { ...row.stored, ownerId: row.ownerId }
    })
    const updated = await updateIssueInTransaction(tx, {
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
    if (!updated) return conflictOutcome(tx, action, now, "stale_revision")
    const deleted = await deleteReadyFilesInTransaction(tx, {
      actorUserId: action.userId,
      files: ordered,
      now,
    })
    if (!deleted) {
      throw new Error("Attachment delete changed during execution")
    }
    return {
      receipt: {
        issueId: updated.id,
        number: updated.number,
        revision: updated.revision,
        deleted: false,
        attachmentMutation: {
          operation: "removed",
          fileIds: stored.value.fileIds,
        },
      },
      conflict: null,
    }
  }
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
