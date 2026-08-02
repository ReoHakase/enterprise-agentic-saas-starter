import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  issueActivityEvents,
  issues,
  type IssueActivityField,
  type IssueActivityValue,
  type IssuePriority,
  type IssueStatus,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, max, sql } from "drizzle-orm"

import {
  issueAuditMetadata,
  toIssueDto,
  type IssueDto,
  type IssueMutationAuditContext,
  type IssueReadDatabase,
  type IssueRow,
  type IssueTransaction,
} from "./repository-support"

export const findIssueById = async (
  db: IssueReadDatabase,
  input: { id: string; organizationId: string }
): Promise<IssueDto | null> => {
  const rows = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.id, input.id),
        eq(issues.organizationId, input.organizationId)
      )
    )
    .limit(1)

  return rows[0] ? toIssueDto(rows[0]) : null
}

export const findIssueByNumber = async (
  db: IssueReadDatabase,
  input: { number: number; organizationId: string }
): Promise<IssueDto | null> => {
  const rows = await db
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.number, input.number),
        eq(issues.organizationId, input.organizationId)
      )
    )
    .limit(1)

  return rows[0] ? toIssueDto(rows[0]) : null
}

const issueNumberQueues = new Map<string, Promise<void>>()
const noop = () => {}

const withIssueNumberLock = async <T>(
  organizationId: string,
  operation: () => Promise<T>
) => {
  const previous = issueNumberQueues.get(organizationId) ?? Promise.resolve()
  let release = noop
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  issueNumberQueues.set(organizationId, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (issueNumberQueues.get(organizationId) === queued) {
      issueNumberQueues.delete(organizationId)
    }
  }
}

export type InsertIssueInput = {
  organizationId: string
  creatorId: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  labels: string[]
  dueDate: Date | null
  id?: string
  now?: Date
  auditContext?: IssueMutationAuditContext
}

export const insertIssueInTransaction = async (
  tx: IssueTransaction,
  input: InsertIssueInput
): Promise<IssueRow> => {
  const numberRows = await tx
    .select({ value: max(issues.number) })
    .from(issues)
    .where(eq(issues.organizationId, input.organizationId))
  const number = (numberRows[0]?.value ?? 0) + 1
  const now = input.now ?? new Date()

  const rows = await tx
    .insert(issues)
    .values({
      id: input.id ?? crypto.randomUUID(),
      organizationId: input.organizationId,
      creatorId: input.creatorId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      labels: input.labels,
      dueDate: input.dueDate,
      number,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const created = rows[0]
  if (!created) throw new Error("insert returned no rows")
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    actorUserId: input.creatorId,
    action: "issue.created",
    targetType: "issue",
    targetId: created.id,
    metadata: issueAuditMetadata(created.number, input.auditContext),
    createdAt: now,
  })
  const activityId = crypto.randomUUID()
  await tx.insert(issueActivityEvents).values({
    id: activityId,
    organizationId: input.organizationId,
    issueId: created.id,
    actorUserId: input.creatorId,
    batchId: activityId,
    kind: "created",
    position: 0,
    fromValue: null,
    toValue: null,
    createdAt: now,
  })
  return created
}

export const insertIssue = async (
  db: Db,
  input: InsertIssueInput
): Promise<IssueDto> =>
  withIssueNumberLock(input.organizationId, async () => {
    const createWithRetry = async (attempt: number): Promise<IssueDto> => {
      try {
        const issue = await db.transaction((tx) =>
          insertIssueInTransaction(tx, input)
        )

        return toIssueDto(issue)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : ""
        const numberConflict =
          message.includes("issues_organization_number_uidx") ||
          message.includes("issues.organization_id, issues.number")
        if (!numberConflict || attempt >= 3) {
          throw cause
        }
        return createWithRetry(attempt + 1)
      }
    }

    return createWithRetry(1)
  })

export type UpdateIssueInput = {
  id: string
  actorUserId: string
  organizationId: string
  title?: string
  description?: string
  status?: IssueStatus
  priority?: IssuePriority
  assigneeId?: string | null
  labels?: string[]
  dueDate?: Date | null
  expectedRevision?: number
  now?: Date
  auditContext?: IssueMutationAuditContext
}

export const updateIssueInTransaction = async (
  tx: IssueTransaction,
  input: UpdateIssueInput
): Promise<IssueRow | null> => {
  const currentRows = await tx
    .select()
    .from(issues)
    .where(
      and(
        eq(issues.id, input.id),
        eq(issues.organizationId, input.organizationId)
      )
    )
    .limit(1)
  const current = currentRows[0]
  if (
    !current ||
    (input.expectedRevision !== undefined &&
      current.revision !== input.expectedRevision)
  ) {
    return null
  }

  const now = input.now ?? new Date()
  const updatedRows = await tx
    .update(issues)
    .set({
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.assigneeId === undefined
        ? {}
        : { assigneeId: input.assigneeId }),
      ...(input.labels === undefined ? {} : { labels: input.labels }),
      ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
      revision: sql`${issues.revision} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(issues.id, input.id),
        eq(issues.organizationId, input.organizationId),
        eq(issues.revision, current.revision)
      )
    )
    .returning()
  const updated = updatedRows[0]
  if (!updated) return null

  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "issue.updated",
    targetType: "issue",
    targetId: input.id,
    metadata: issueAuditMetadata(updated.number, input.auditContext),
    createdAt: now,
  })
  const batchId = crypto.randomUUID()
  const candidates: Array<{
    field: IssueActivityField
    fromValue: IssueActivityValue
    toValue: IssueActivityValue
  }> = [
    { field: "title", fromValue: current.title, toValue: updated.title },
    {
      field: "description",
      fromValue: current.description,
      toValue: updated.description,
    },
    { field: "status", fromValue: current.status, toValue: updated.status },
    {
      field: "priority",
      fromValue: current.priority,
      toValue: updated.priority,
    },
    {
      field: "assignee",
      fromValue: current.assigneeId,
      toValue: updated.assigneeId,
    },
    { field: "labels", fromValue: current.labels, toValue: updated.labels },
    {
      field: "due_date",
      fromValue: current.dueDate?.toISOString() ?? null,
      toValue: updated.dueDate?.toISOString() ?? null,
    },
  ]
  const changes = candidates.filter(
    (candidate) =>
      JSON.stringify(candidate.fromValue) !== JSON.stringify(candidate.toValue)
  )
  if (changes.length > 0) {
    await tx.insert(issueActivityEvents).values(
      changes.map((change, position) => ({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        issueId: input.id,
        actorUserId: input.actorUserId,
        batchId,
        position,
        kind: "field_changed" as const,
        field: change.field,
        fromValue: change.fromValue,
        toValue: change.toValue,
        createdAt: now,
      }))
    )
  }
  return updated
}

export const updateIssueById = async (
  db: Db,
  input: UpdateIssueInput
): Promise<IssueDto | null> => {
  const row = await db.transaction((tx) => updateIssueInTransaction(tx, input))
  return row ? toIssueDto(row) : null
}
