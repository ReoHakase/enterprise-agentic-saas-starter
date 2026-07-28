import {
  files,
  issueFileOwners,
  issues,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray } from "drizzle-orm"

import type {
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentIssueActionPreview,
  AgentUpdateIssueActionInput,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import {
  createIssueActionPayloadModel,
  deleteIssueActionPayloadModel,
  updateIssueActionPayloadModel,
} from "../action-schema"
import type { AgentTransaction, ValidGrant } from "../threads/repository"
import {
  canonicalizeLabels,
  getActionAssetSnapshots,
  readAssigneeName,
  resolveAssigneeName,
  type AssetSnapshot,
} from "./prepare-read-support"
import {
  normalizeDueDate,
  safeStoredParse,
  type PrepareInput,
  type StoredCreateIssuePayload,
  type StoredDeleteIssuePayload,
  type StoredUpdateIssuePayload,
} from "./repository-support"

export type PreparedIssueActionInput =
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

export type PreparedIssueAction = {
  targetId: string
  targetRevision: number | null
  normalizedPayload: Record<string, unknown>
  preview: AgentIssueActionPreview
  snapshots: AssetSnapshot[]
}

type IssueRow = typeof issues.$inferSelect

const buildCreateIssueAction = async (
  tx: AgentTransaction,
  input: Extract<PreparedIssueActionInput, { kind: "create_issue" }>,
  context: ValidGrant,
  now: Date,
  requestFingerprint: string
): Promise<PreparedIssueAction> => {
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
  const snapshots = await getActionAssetSnapshots(tx, {
    context,
    assetIds: issue.attachmentAssetIds,
    now,
  })
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
  return {
    targetId: crypto.randomUUID(),
    targetRevision: null,
    normalizedPayload: stored,
    preview: {
      kind: input.kind,
      destructive: false,
      attachmentOperation: snapshots.length > 0 ? "add" : null,
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
        source: "asset" as const,
        assetId,
        filename,
        sizeBytes,
      })),
    },
    snapshots,
  }
}

const readCurrentIssue = async (
  tx: AgentTransaction,
  context: ValidGrant,
  issueId: string,
  expectedRevision: number
) => {
  const currentRows = await tx
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, context.organizationId),
        eq(issues.id, issueId)
      )
    )
    .limit(1)
  const current = currentRows[0]
  if (!current) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }
  if (current.revision !== expectedRevision) {
    throw publicErrors.conflict("Issue revision changed", {
      reason: "stale_revision",
      resource: "issue",
    })
  }
  return current
}

const buildDeleteIssueAction = (
  input: Extract<PreparedIssueActionInput, { kind: "delete_issue" }>,
  context: ValidGrant,
  current: IssueRow,
  requestFingerprint: string
): PreparedIssueAction => {
  safeStoredParse(deleteIssueActionPayloadModel, input.issue)
  if (context.role === "member" && current.creatorId !== context.userId) {
    throw publicErrors.forbidden("Only the creator or an admin can delete")
  }
  const stored = {
    requestFingerprint,
    issueId: current.id,
    expectedRevision: current.revision,
  } satisfies StoredDeleteIssuePayload
  return {
    targetId: current.id,
    targetRevision: current.revision,
    normalizedPayload: stored,
    preview: {
      kind: input.kind,
      destructive: true,
      attachmentOperation: null,
      title: current.title,
      issueNumber: current.number,
      issueRevision: current.revision,
      fields: [],
      attachments: [],
    },
    snapshots: [],
  }
}

const buildIssueChanges = (
  issue: {
    title?: string
    description?: string
    status?: "open" | "in_progress" | "closed"
    priority?: "no_priority" | "urgent" | "high" | "medium" | "low"
    assigneeId?: string | null
    dueDate?: string | null
  },
  labels: string[] | undefined
): Extract<StoredUpdateIssuePayload, { operation: "fields" }>["changes"] => ({
  ...(issue.title === undefined ? {} : { title: issue.title }),
  ...(issue.description === undefined
    ? {}
    : { description: issue.description.trim() }),
  ...(issue.status === undefined ? {} : { status: issue.status }),
  ...(issue.priority === undefined ? {} : { priority: issue.priority }),
  ...(issue.assigneeId === undefined ? {} : { assigneeId: issue.assigneeId }),
  ...(labels === undefined ? {} : { labels }),
  ...(issue.dueDate === undefined
    ? {}
    : { dueDate: normalizeDueDate(issue.dueDate) }),
})

const buildUpdatePreviewFields = (
  current: IssueRow,
  changes: Extract<
    StoredUpdateIssuePayload,
    { operation: "fields" }
  >["changes"],
  beforeAssignee: string | null,
  afterAssignee: string | null | undefined
): AgentIssueActionPreview["fields"] => {
  const fields: AgentIssueActionPreview["fields"] = []
  if (changes.title !== undefined) {
    fields.push({ field: "title", before: current.title, after: changes.title })
  }
  if (changes.description !== undefined) {
    fields.push({
      field: "description",
      before: current.description,
      after: changes.description,
    })
  }
  if (changes.status !== undefined) {
    fields.push({
      field: "status",
      before: current.status,
      after: changes.status,
    })
  }
  if (changes.priority !== undefined) {
    fields.push({
      field: "priority",
      before: current.priority,
      after: changes.priority,
    })
  }
  if (Object.hasOwn(changes, "assigneeId")) {
    fields.push({
      field: "assignee",
      before: beforeAssignee,
      after: afterAssignee ?? null,
    })
  }
  if (changes.labels !== undefined) {
    fields.push({
      field: "labels",
      before: current.labels,
      after: changes.labels,
    })
  }
  if (Object.hasOwn(changes, "dueDate")) {
    fields.push({
      field: "due_date",
      before: current.dueDate?.toISOString() ?? null,
      after: changes.dueDate ?? null,
    })
  }
  return fields
}

const buildUpdateIssueAction = async (
  tx: AgentTransaction,
  input: Extract<PreparedIssueActionInput, { kind: "update_issue" }>,
  context: ValidGrant,
  current: IssueRow,
  now: Date,
  requestFingerprint: string
): Promise<PreparedIssueAction> => {
  const issue = safeStoredParse(updateIssueActionPayloadModel, input.issue)
  if (issue.operation === "add_attachments") {
    const snapshots = await getActionAssetSnapshots(tx, {
      assetIds: issue.attachmentAssetIds,
      context,
      now,
    })
    const stored = {
      operation: "add_attachments",
      requestFingerprint,
      issueId: current.id,
      expectedRevision: current.revision,
      attachments: snapshots.map(({ assetId }) => ({
        assetId,
        fileId: crypto.randomUUID(),
      })),
    } satisfies StoredUpdateIssuePayload
    return {
      targetId: current.id,
      targetRevision: current.revision,
      normalizedPayload: stored,
      preview: {
        kind: input.kind,
        destructive: false,
        attachmentOperation: "add",
        title: current.title,
        issueNumber: current.number,
        issueRevision: current.revision,
        fields: [],
        attachments: snapshots.map(({ assetId, filename, sizeBytes }) => ({
          source: "asset" as const,
          assetId,
          filename,
          sizeBytes,
        })),
      },
      snapshots,
    }
  }
  if (issue.operation === "remove_attachments") {
    const rows = await tx
      .select({
        fileId: files.id,
        filename: files.filename,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(
        issueFileOwners,
        and(
          eq(issueFileOwners.organizationId, files.organizationId),
          eq(issueFileOwners.fileId, files.id),
          eq(issueFileOwners.ownerType, "issue"),
          eq(issueFileOwners.issueId, current.id)
        )
      )
      .where(
        and(
          eq(files.organizationId, context.organizationId),
          eq(files.status, "ready"),
          inArray(files.id, issue.attachmentFileIds)
        )
      )
    if (rows.length !== issue.attachmentFileIds.length) {
      throw publicErrors.notFound("Issue attachment not found", {
        resource: "file",
      })
    }
    const byId = new Map(rows.map((row) => [row.fileId, row]))
    const ordered = issue.attachmentFileIds.map((fileId) => {
      const row = byId.get(fileId)
      if (!row) throw new Error("Attachment snapshot ordering failed")
      return row
    })
    const stored = {
      operation: "remove_attachments",
      requestFingerprint,
      issueId: current.id,
      expectedRevision: current.revision,
      fileIds: issue.attachmentFileIds,
    } satisfies StoredUpdateIssuePayload
    return {
      targetId: current.id,
      targetRevision: current.revision,
      normalizedPayload: stored,
      preview: {
        kind: input.kind,
        destructive: true,
        attachmentOperation: "remove",
        title: current.title,
        issueNumber: current.number,
        issueRevision: current.revision,
        fields: [],
        attachments: ordered.map(({ fileId, filename, sizeBytes }) => ({
          source: "file" as const,
          fileId,
          filename,
          sizeBytes,
        })),
      },
      snapshots: [],
    }
  }
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
  const changes = buildIssueChanges(issue, labels)
  const stored = {
    operation: "fields",
    requestFingerprint,
    issueId: current.id,
    expectedRevision: current.revision,
    changes,
  } satisfies StoredUpdateIssuePayload
  return {
    targetId: current.id,
    targetRevision: current.revision,
    normalizedPayload: stored,
    preview: {
      kind: input.kind,
      destructive: false,
      attachmentOperation: null,
      title: current.title,
      issueNumber: current.number,
      issueRevision: current.revision,
      fields: buildUpdatePreviewFields(
        current,
        changes,
        beforeAssignee,
        afterAssignee
      ),
      attachments: [],
    },
    snapshots: [],
  }
}

export const buildPreparedIssueAction = async (
  tx: AgentTransaction,
  input: PreparedIssueActionInput,
  context: ValidGrant,
  now: Date,
  requestFingerprint: string
): Promise<PreparedIssueAction> => {
  if (input.kind === "create_issue") {
    return buildCreateIssueAction(tx, input, context, now, requestFingerprint)
  }
  const current = await readCurrentIssue(
    tx,
    context,
    input.issue.issueId,
    input.issue.expectedRevision
  )
  if (input.kind === "delete_issue") {
    return buildDeleteIssueAction(input, context, current, requestFingerprint)
  }
  return buildUpdateIssueAction(
    tx,
    input,
    context,
    current,
    now,
    requestFingerprint
  )
}
