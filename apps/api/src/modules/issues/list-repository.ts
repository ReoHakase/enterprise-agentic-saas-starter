import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  files,
  issueFileOwners,
  issues,
  issueThumbnailSelections,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { isPreviewableImageFormat } from "../files/public"
import {
  findEffectiveIssueThumbnail,
  issueAuditMetadata,
  issueListConditions,
  issueListOrder,
  loadIssueListSummaries,
  toIssueDto,
  type IssueDto,
  type IssueListItemDto,
  type IssueReadDatabase,
  type IssueThumbnailDto,
  type IssueThumbnailFileDto,
  type ListIssuesInput,
} from "./repository-support"

export const listIssuesByOrganization = async (
  db: IssueReadDatabase,
  input: ListIssuesInput
): Promise<IssueDto[]> => {
  const rows = await db
    .select()
    .from(issues)
    .where(and(...issueListConditions(input)))
    .orderBy(...issueListOrder(input))
    .limit(input.limit ?? 50)

  return rows.map(toIssueDto)
}

export const listIssuePageByOrganization = async (
  db: Db,
  input: Omit<ListIssuesInput, "limit"> & { page: number }
): Promise<{
  items: IssueListItemDto[]
  page: number
  pageSize: 20 | 50 | 100
  total: number
}> => {
  const pageSize = input.pageSize ?? 20
  return db.transaction(async (tx) => {
    const conditions = issueListConditions(input)
    const [countRows, rows] = await Promise.all([
      tx
        .select({ total: sql<number>`count(*)` })
        .from(issues)
        .where(and(...conditions)),
      tx
        .select()
        .from(issues)
        .where(and(...conditions))
        .orderBy(...issueListOrder(input))
        .limit(pageSize)
        .offset((input.page - 1) * pageSize),
    ])
    const summaries =
      rows.length === 0
        ? {
            attachmentCounts: new Map<string, number>(),
            commentCounts: new Map<string, number>(),
            thumbnails: new Map<string, IssueThumbnailFileDto | null>(),
          }
        : await loadIssueListSummaries(tx, {
            issueIds: rows.map((row) => row.id),
            organizationId: input.organizationId,
          })
    return {
      items: rows.map((row) =>
        Object.assign(toIssueDto(row), {
          attachmentCount: summaries.attachmentCounts.get(row.id) ?? 0,
          commentCount: summaries.commentCounts.get(row.id) ?? 0,
          thumbnail: summaries.thumbnails.get(row.id) ?? null,
        })
      ),
      page: input.page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    }
  })
}

export const listIssueLabelsByOrganization = async (
  db: Db,
  input: { organizationId: string; search?: string }
): Promise<string[]> => {
  const search = input.search?.trim().toLocaleLowerCase("en-US") ?? ""
  const escapedSearch = search
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_")
  const rows = await db.all<{ label: string }>(sql`
      select min(trim(cast(json_each.value as text))) as label
      from ${issues}, json_each(${issues.labels})
      where ${issues.organizationId} = ${input.organizationId}
        and trim(cast(json_each.value as text)) != ''
        and (
          ${search} = ''
          or lower(trim(cast(json_each.value as text)))
            like ${`%${escapedSearch}%`} escape '!'
        )
      group by lower(trim(cast(json_each.value as text)))
      order by
        case
          when lower(label) like ${`${escapedSearch}%`} escape '!' then 0
          else 1
        end,
        lower(label),
        label
      limit 50
  `)
  return rows.map((row) => row.label)
}

export const getEffectiveIssueThumbnail = async (
  db: Db,
  input: { issueId: string; organizationId: string }
): Promise<IssueThumbnailDto> => findEffectiveIssueThumbnail(db, input)

export const setIssueThumbnail = async (
  db: Db,
  input: {
    actorUserId: string
    fileId: string | null
    issueId: string
    organizationId: string
    now?: Date
  }
): Promise<IssueThumbnailDto | null> =>
  db.transaction(async (tx) => {
    const currentIssueRows = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId)
        )
      )
      .limit(1)
    const currentIssue = currentIssueRows[0]
    if (!currentIssue) return null

    if (input.fileId) {
      const candidateRows = await tx
        .select({
          detectedImageFormat: files.detectedImageFormat,
        })
        .from(issueFileOwners)
        .innerJoin(
          files,
          and(
            eq(files.id, issueFileOwners.fileId),
            eq(files.organizationId, issueFileOwners.organizationId),
            eq(files.ownerType, issueFileOwners.ownerType)
          )
        )
        .where(
          and(
            eq(issueFileOwners.fileId, input.fileId),
            eq(issueFileOwners.issueId, input.issueId),
            eq(issueFileOwners.organizationId, input.organizationId),
            eq(files.status, "ready")
          )
        )
        .limit(1)
      const candidate = candidateRows[0]
      if (!candidate) {
        throw new HttpError({ code: "not_found" })
      }
      if (!isPreviewableImageFormat(candidate.detectedImageFormat)) {
        throw new HttpError({ code: "validation_error" })
      }
    }

    const currentSelectionRows = await tx
      .select({ fileId: issueThumbnailSelections.fileId })
      .from(issueThumbnailSelections)
      .where(
        and(
          eq(issueThumbnailSelections.issueId, input.issueId),
          eq(issueThumbnailSelections.organizationId, input.organizationId)
        )
      )
      .limit(1)
    const currentFileId = currentSelectionRows[0]?.fileId ?? null
    if (currentFileId === input.fileId) {
      return findEffectiveIssueThumbnail(tx, input)
    }

    if (input.fileId) {
      await tx
        .insert(issueThumbnailSelections)
        .values({
          organizationId: input.organizationId,
          issueId: input.issueId,
          fileId: input.fileId,
        })
        .onConflictDoUpdate({
          target: [
            issueThumbnailSelections.issueId,
            issueThumbnailSelections.organizationId,
          ],
          set: { fileId: input.fileId },
        })
    } else {
      await tx
        .delete(issueThumbnailSelections)
        .where(
          and(
            eq(issueThumbnailSelections.issueId, input.issueId),
            eq(issueThumbnailSelections.organizationId, input.organizationId)
          )
        )
    }

    const now = input.now ?? new Date()
    await tx
      .update(issues)
      .set({
        revision: sql`${issues.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(issues.id, input.issueId),
          eq(issues.organizationId, input.organizationId),
          eq(issues.revision, currentIssue.revision)
        )
      )
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "issue.updated",
      targetType: "issue",
      targetId: input.issueId,
      metadata: issueAuditMetadata(currentIssue.number),
      createdAt: now,
    })

    return findEffectiveIssueThumbnail(tx, input)
  })
