import type { Db } from "@enterprise-agentic-saas/db"
import {
  files,
  issueComments,
  issueFileOwners,
  issues,
  issueThumbnailSelections,
  member,
  user,
} from "@enterprise-agentic-saas/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { previewableImageFormats } from "../files/public"
import type {
  IssueCommentDto,
  IssueDto,
  IssueMutationAuditContext,
  IssueThumbnailDto,
  IssueThumbnailFileDto,
  IssueTimelinePageDto,
  ListIssuesInput,
} from "./domain"
import { type IssueTimelineItemType } from "./timeline-cursor"

export type {
  IssueCommentDto,
  IssueDto,
  IssueListItemDto,
  IssueMutationAuditContext,
  IssueThumbnailDto,
  IssueThumbnailFileDto,
  IssueTimelinePageDto,
  ListIssuesInput,
} from "./domain"

type IssueTimelineItemDto = IssueTimelinePageDto["items"][number]

export type OrderedIssueTimelineItem = {
  item: IssueTimelineItemDto
  position: number
}

export const timelineItemTypeOrder: Record<IssueTimelineItemType, number> = {
  activity: 0,
  comment: 1,
}

const compareTextDescending = (left: string, right: string) => {
  if (left === right) return 0
  return left < right ? 1 : -1
}

export const combineAllConditions = (...conditions: SQL[]) =>
  and(...conditions) ?? sql`false`

export const combineAnyConditions = (...conditions: SQL[]) =>
  or(...conditions) ?? sql`false`

export const compareTimelineItemsDescending = (
  left: OrderedIssueTimelineItem,
  right: OrderedIssueTimelineItem
) => {
  const timeDifference =
    new Date(right.item.createdAt).getTime() -
    new Date(left.item.createdAt).getTime()
  if (timeDifference !== 0) return timeDifference

  const positionDifference = right.position - left.position
  if (positionDifference !== 0) return positionDifference

  const idDifference = compareTextDescending(left.item.id, right.item.id)
  if (idDifference !== 0) return idDifference

  return (
    timelineItemTypeOrder[right.item.type] -
    timelineItemTypeOrder[left.item.type]
  )
}

export type IssueRow = typeof issues.$inferSelect
type IssueCommentRow = typeof issueComments.$inferSelect
export type IssueTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export const issueAuditMetadata = (
  number: number,
  context?: IssueMutationAuditContext
) => ({
  number,
  ...(context
    ? {
        source: context.source,
        approvalMode: context.approvalMode,
        actionId: context.actionId,
      }
    : {}),
})

export type IssueCommentWithAuthorRow = IssueCommentRow & {
  authorUserId: string | null
  authorName: string | null
  authorProfileImage: string | null
}

export const toIssueDto = (issue: IssueRow): IssueDto => ({
  ...issue,
  dueDate: issue.dueDate?.toISOString() ?? null,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
})

const thumbnailFileSelection = {
  id: files.id,
  filename: files.filename,
  imageWidth: files.imageWidth,
  imageHeight: files.imageHeight,
}

const toThumbnailFileDto = (
  row: IssueThumbnailFileDto
): IssueThumbnailFileDto => ({
  id: row.id,
  filename: row.filename,
  imageWidth: row.imageWidth,
  imageHeight: row.imageHeight,
})

export const toIssueCommentDto = (
  comment: IssueCommentWithAuthorRow
): IssueCommentDto => {
  const { authorProfileImage, authorName, authorUserId, ...fields } = comment
  return {
    ...fields,
    author: {
      id: comment.authorId,
      name: authorUserId && authorName ? authorName : "Former member",
      profileImage: authorUserId ? authorProfileImage : null,
    },
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  }
}

export const issueCommentSelection = {
  id: issueComments.id,
  organizationId: issueComments.organizationId,
  issueId: issueComments.issueId,
  authorId: issueComments.authorId,
  body: issueComments.body,
  createdAt: issueComments.createdAt,
  updatedAt: issueComments.updatedAt,
  authorUserId: user.id,
  authorName: user.name,
  authorProfileImage: user.image,
}

export const tenantSafeAuthorJoin = and(
  eq(user.id, issueComments.authorId),
  sql`exists (
    select 1
    from ${member}
    where ${member.userId} = ${issueComments.authorId}
      and ${member.organizationId} = ${issueComments.organizationId}
  )`
)

export const ISSUE_LIST_PAGE_SIZE = 10

export type IssueReadDatabase = Pick<Db, "select">

export const issueListConditions = (input: ListIssuesInput): SQL[] => {
  const conditions: SQL[] = [eq(issues.organizationId, input.organizationId)]

  const search = input.search?.trim()
  if (search) {
    const searchCondition = or(
      like(issues.title, `%${search}%`),
      like(issues.description, `%${search}%`)
    )
    if (searchCondition) conditions.push(searchCondition)
  }
  if (input.status) conditions.push(eq(issues.status, input.status))
  if (input.priority) conditions.push(eq(issues.priority, input.priority))
  if (input.assigneeId === "unassigned") {
    conditions.push(sql`${issues.assigneeId} is null`)
  } else if (input.assigneeId) {
    conditions.push(eq(issues.assigneeId, input.assigneeId))
  }
  if (input.label) {
    conditions.push(
      sql`exists (select 1 from json_each(${issues.labels}) where json_each.value = ${input.label})`
    )
  }
  return conditions
}

export const issueListOrder = (input: ListIssuesInput): SQL[] => {
  const sortColumns = {
    number: issues.number,
    createdAt: issues.createdAt,
    updatedAt: issues.updatedAt,
    dueDate: issues.dueDate,
    priority: issues.priority,
    status: issues.status,
  }
  const direction = input.sortDirection === "asc" ? asc : desc
  const primary = direction(sortColumns[input.sortBy ?? "updatedAt"])
  const tieBreakers =
    input.sortBy === "number"
      ? [direction(issues.id)]
      : [direction(issues.number), direction(issues.id)]
  return [primary, ...tieBreakers]
}

const previewableFileCondition = inArray(files.detectedImageFormat, [
  ...previewableImageFormats,
])

export const findEffectiveIssueThumbnail = async (
  db: Pick<Db, "select">,
  input: { issueId: string; organizationId: string }
): Promise<IssueThumbnailDto> => {
  const selectedRows = await db
    .select(thumbnailFileSelection)
    .from(issueThumbnailSelections)
    .innerJoin(
      files,
      and(
        eq(files.id, issueThumbnailSelections.fileId),
        eq(files.organizationId, issueThumbnailSelections.organizationId)
      )
    )
    .where(
      and(
        eq(issueThumbnailSelections.issueId, input.issueId),
        eq(issueThumbnailSelections.organizationId, input.organizationId),
        eq(files.status, "ready"),
        previewableFileCondition
      )
    )
    .limit(1)
  const selected = selectedRows[0]
  if (selected) {
    return { mode: "selected", file: toThumbnailFileDto(selected) }
  }

  const automaticRows = await db
    .select(thumbnailFileSelection)
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
        eq(issueFileOwners.issueId, input.issueId),
        eq(issueFileOwners.organizationId, input.organizationId),
        eq(files.status, "ready"),
        previewableFileCondition
      )
    )
    .orderBy(asc(files.createdAt), asc(files.id))
    .limit(1)

  return {
    mode: "automatic",
    file: automaticRows[0] ? toThumbnailFileDto(automaticRows[0]) : null,
  }
}

export const loadIssueListSummaries = async (
  db: Pick<Db, "select">,
  input: { issueIds: string[]; organizationId: string }
) => {
  const [attachmentRows, commentRows, selectedRows] = await Promise.all([
    db
      .select({
        issueId: issueFileOwners.issueId,
        count: sql<number>`count(*)`,
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
          eq(issueFileOwners.organizationId, input.organizationId),
          inArray(issueFileOwners.issueId, input.issueIds),
          eq(files.status, "ready")
        )
      )
      .groupBy(issueFileOwners.issueId),
    db
      .select({
        issueId: issueComments.issueId,
        count: sql<number>`count(*)`,
      })
      .from(issueComments)
      .where(
        and(
          eq(issueComments.organizationId, input.organizationId),
          inArray(issueComments.issueId, input.issueIds)
        )
      )
      .groupBy(issueComments.issueId),
    db
      .select({
        issueId: issueThumbnailSelections.issueId,
        ...thumbnailFileSelection,
      })
      .from(issueThumbnailSelections)
      .innerJoin(
        files,
        and(
          eq(files.id, issueThumbnailSelections.fileId),
          eq(files.organizationId, issueThumbnailSelections.organizationId)
        )
      )
      .where(
        and(
          eq(issueThumbnailSelections.organizationId, input.organizationId),
          inArray(issueThumbnailSelections.issueId, input.issueIds),
          eq(files.status, "ready"),
          previewableFileCondition
        )
      ),
  ])
  const defaultCandidates = db
    .select({
      issueId: issueFileOwners.issueId,
      ...thumbnailFileSelection,
      rank: sql<number>`row_number() over (
        partition by ${issueFileOwners.issueId}
        order by ${files.createdAt} asc, ${files.id} asc
      )`.as("thumbnail_rank"),
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
        eq(issueFileOwners.organizationId, input.organizationId),
        inArray(issueFileOwners.issueId, input.issueIds),
        eq(files.status, "ready"),
        previewableFileCondition
      )
    )
    .as("default_thumbnail_candidates")
  const defaultRows = await db
    .select()
    .from(defaultCandidates)
    .where(eq(defaultCandidates.rank, 1))

  const attachmentCounts = new Map(
    attachmentRows.map((row) => [row.issueId, Number(row.count)])
  )
  const commentCounts = new Map(
    commentRows.map((row) => [row.issueId, Number(row.count)])
  )
  const selectedThumbnails = new Map(
    selectedRows.map((row) => [row.issueId, toThumbnailFileDto(row)])
  )
  const defaultThumbnails = new Map(
    defaultRows.map((row) => [row.issueId, toThumbnailFileDto(row)])
  )

  return {
    attachmentCounts,
    commentCounts,
    thumbnails: new Map(
      input.issueIds.map((issueId) => [
        issueId,
        selectedThumbnails.get(issueId) ??
          defaultThumbnails.get(issueId) ??
          null,
      ])
    ),
  }
}
