import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  fileCleanupJobs,
  files,
  issueComments,
  issueFileOwners,
  issues,
  organizationFileUsage,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import {
  getFileOwnerAdapter,
  releaseDeletedFileStorageObjectsInTransaction,
} from "../files/public"
import {
  issueAuditMetadata,
  issueCommentSelection,
  tenantSafeAuthorJoin,
  toIssueCommentDto,
  toIssueDto,
  type IssueCommentDto,
  type IssueDto,
  type IssueMutationAuditContext,
  type IssueRow,
  type IssueTransaction,
} from "./repository-support"

export type DeleteIssueInput = {
  actorUserId: string
  id: string
  organizationId: string
  expectedRevision?: number
  now?: Date
  auditContext?: IssueMutationAuditContext
}

export const deleteIssueInTransaction = async (
  tx: IssueTransaction,
  input: DeleteIssueInput
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
  const ownedFiles = await tx
    .select({
      id: files.id,
      keyVersion: files.keyVersion,
      objectKey: files.objectKey,
      sizeBytes: files.sizeBytes,
      storageObjectId: files.storageObjectId,
    })
    .from(files)
    .innerJoin(
      issueFileOwners,
      and(
        eq(issueFileOwners.fileId, files.id),
        eq(issueFileOwners.organizationId, files.organizationId),
        eq(issueFileOwners.ownerType, files.ownerType)
      )
    )
    .where(
      and(
        eq(files.organizationId, input.organizationId),
        eq(files.ownerType, "issue"),
        eq(issueFileOwners.issueId, input.id)
      )
    )
  if (ownedFiles.length > 0) {
    await tx.delete(files).where(
      and(
        eq(files.organizationId, input.organizationId),
        eq(files.ownerType, "issue"),
        inArray(
          files.id,
          ownedFiles.map(({ id }) => id)
        )
      )
    )
    await releaseDeletedFileStorageObjectsInTransaction(tx, {
      files: ownedFiles,
      now,
      organizationId: input.organizationId,
    })
  }
  const deletedRows = await tx
    .delete(issues)
    .where(
      and(
        eq(issues.id, input.id),
        eq(issues.organizationId, input.organizationId),
        eq(issues.revision, current.revision)
      )
    )
    .returning()
  const deleted = deletedRows[0]
  if (!deleted) {
    throw new Error("Issue changed during delete transaction")
  }

  const releasedBytes = ownedFiles.reduce(
    (total, file) => total + file.sizeBytes,
    0
  )
  if (releasedBytes > 0) {
    const usageRows = await tx
      .update(organizationFileUsage)
      .set({
        updatedAt: now,
        usedBytes: sql`${organizationFileUsage.usedBytes} - ${releasedBytes}`,
      })
      .where(
        and(
          eq(organizationFileUsage.organizationId, input.organizationId),
          sql`${organizationFileUsage.usedBytes} >= ${releasedBytes}`
        )
      )
      .returning({ usedBytes: organizationFileUsage.usedBytes })
    if (!usageRows[0]) {
      throw new Error("Organization file usage is inconsistent")
    }
  }

  const prefix = getFileOwnerAdapter("issue").cleanupPrefix({
    organizationId: input.organizationId,
    ownerId: input.id,
  })
  await tx
    .insert(fileCleanupJobs)
    .values({
      id: crypto.randomUUID(),
      kind: "owner_prefix",
      organizationId: input.organizationId,
      prefix,
    })
    .onConflictDoNothing()

  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "issue.deleted",
    targetType: "issue",
    targetId: input.id,
    metadata: issueAuditMetadata(deleted.number, input.auditContext),
    createdAt: now,
  })
  return deleted
}

export const deleteIssueById = async (
  db: Db,
  input: DeleteIssueInput
): Promise<IssueDto | null> => {
  try {
    const row = await db.transaction((tx) =>
      deleteIssueInTransaction(tx, input)
    )
    return row ? toIssueDto(row) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "deleteIssueById",
    })
  }
}

export const listIssueComments = async (
  db: Db,
  input: { organizationId: string; issueId: string }
): Promise<IssueCommentDto[]> => {
  try {
    const rows = await db
      .select(issueCommentSelection)
      .from(issueComments)
      .leftJoin(user, tenantSafeAuthorJoin)
      .where(
        and(
          eq(issueComments.organizationId, input.organizationId),
          eq(issueComments.issueId, input.issueId)
        )
      )
      .orderBy(asc(issueComments.createdAt))

    return rows.map(toIssueCommentDto)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "listIssueComments",
    })
  }
}

export const insertIssueComment = async (
  db: Db,
  input: {
    organizationId: string
    issueId: string
    authorId: string
    body: string
  }
): Promise<IssueCommentDto> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(issueComments)
        .values({ id: crypto.randomUUID(), ...input })
        .returning()
      if (insertedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.authorId,
          action: "issue.comment.created",
          targetType: "issue_comment",
          targetId: insertedRows[0].id,
          metadata: { issueId: input.issueId },
        })
      }
      return insertedRows
    })
    const comment = rows[0]
    if (!comment) {
      throw new Error("insert returned no comment")
    }
    const hydrated = await findIssueCommentById(db, {
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: comment.id,
    })
    if (!hydrated) {
      throw new Error("inserted comment could not be loaded")
    }
    return hydrated
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "insertIssueComment",
    })
  }
}

export const findIssueCommentById = async (
  db: Db,
  input: { organizationId: string; issueId: string; commentId: string }
): Promise<IssueCommentDto | null> => {
  try {
    const rows = await db
      .select(issueCommentSelection)
      .from(issueComments)
      .leftJoin(user, tenantSafeAuthorJoin)
      .where(
        and(
          eq(issueComments.id, input.commentId),
          eq(issueComments.issueId, input.issueId),
          eq(issueComments.organizationId, input.organizationId)
        )
      )
      .limit(1)
    return rows[0] ? toIssueCommentDto(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "findIssueCommentById",
    })
  }
}

export const updateIssueCommentById = async (
  db: Db,
  input: {
    organizationId: string
    actorUserId: string
    issueId: string
    commentId: string
    body: string
  }
): Promise<IssueCommentDto | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(issueComments)
        .set({ body: input.body, updatedAt: new Date() })
        .where(
          and(
            eq(issueComments.id, input.commentId),
            eq(issueComments.issueId, input.issueId),
            eq(issueComments.organizationId, input.organizationId)
          )
        )
        .returning()
      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "issue.comment.updated",
          targetType: "issue_comment",
          targetId: input.commentId,
          metadata: { issueId: input.issueId },
        })
      }
      return updatedRows
    })
    if (!rows[0]) {
      return null
    }
    return findIssueCommentById(db, {
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: input.commentId,
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "updateIssueCommentById",
    })
  }
}

export const deleteIssueCommentById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    issueId: string
    commentId: string
  }
): Promise<IssueCommentDto | null> => {
  try {
    const current = await findIssueCommentById(db, input)
    if (!current) {
      return null
    }
    const rows = await db.transaction(async (tx) => {
      const deletedRows = await tx
        .delete(issueComments)
        .where(
          and(
            eq(issueComments.id, input.commentId),
            eq(issueComments.issueId, input.issueId),
            eq(issueComments.organizationId, input.organizationId)
          )
        )
        .returning()
      if (deletedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "issue.comment.deleted",
          targetType: "issue_comment",
          targetId: input.commentId,
          metadata: { issueId: input.issueId },
        })
      }
      return deletedRows
    })
    return rows[0] ? current : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "deleteIssueCommentById",
    })
  }
}
