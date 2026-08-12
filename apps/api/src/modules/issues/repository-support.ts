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
  gte,
  inArray,
  lt,
  lte,
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
        actionId: context.actionId,
        ...(context.source === "agent"
          ? { approvalMode: context.approvalMode }
          : {}),
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

export type IssueReadDatabase = Pick<Db, "select">

const priorityRank = sql<number>`case ${issues.priority}
  when 'no_priority' then 0
  when 'low' then 1
  when 'medium' then 2
  when 'high' then 3
  when 'urgent' then 4
  else 5 end`

const statusRank = sql<number>`case ${issues.status}
  when 'open' then 0
  when 'in_progress' then 1
  when 'closed' then 2
  else 3 end`

const priorityRanks = {
  no_priority: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
} as const

const escapeLikeLiteral = (value: string) =>
  value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_")

const issueSearchCondition = (input: ListIssuesInput) => {
  const search = input.search?.trim()
  if (!search) return undefined
  const pattern = `%${escapeLikeLiteral(search.toLocaleLowerCase("en-US"))}%`
  return or(
    sql`lower(${issues.title}) like ${pattern} escape '!'`,
    sql`lower(${issues.description}) like ${pattern} escape '!'`
  )
}

const issueStatusCondition = (input: ListIssuesInput) => {
  const statuses = input.statuses ?? (input.status ? [input.status] : undefined)
  return statuses?.length ? inArray(issues.status, statuses) : undefined
}

const issuePriorityConditions = (input: ListIssuesInput) => {
  const priorityFrom = input.priorityFrom ?? input.priority
  const priorityTo = input.priorityTo ?? input.priority
  return [
    priorityFrom ? gte(priorityRank, priorityRanks[priorityFrom]) : undefined,
    priorityTo ? lte(priorityRank, priorityRanks[priorityTo]) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined)
}

const issueAssigneeCondition = (input: ListIssuesInput) => {
  const assigneeIds =
    input.assigneeIds ??
    (input.assigneeId === undefined ? undefined : [input.assigneeId])
  if (!assigneeIds?.length) return undefined
  const assignedIds = assigneeIds.filter(
    (assigneeId) => assigneeId !== "unassigned"
  )
  const assigneeConditions = [
    assigneeIds.includes("unassigned")
      ? sql`${issues.assigneeId} is null`
      : undefined,
    assignedIds.length > 0
      ? inArray(issues.assigneeId, assignedIds)
      : undefined,
  ].filter((condition): condition is SQL => condition !== undefined)
  return or(...assigneeConditions)
}

const issueLabelCondition = (input: ListIssuesInput) => {
  const labels = input.labels ?? (input.label ? [input.label] : undefined)
  if (!labels?.length) return undefined
  const labelConditions = labels.map(
    (label) =>
      sql`exists (
          select 1 from json_each(${issues.labels})
          where lower(trim(cast(json_each.value as text))) =
            ${label.toLocaleLowerCase("en-US")}
        )`
  )
  return input.labelMode === "all"
    ? and(...labelConditions)
    : or(...labelConditions)
}

const localDateBoundary = (date: string, offset: number) => {
  const boundary = new Date(`${date}T00:00:00.000Z`)
  boundary.setUTCMinutes(boundary.getUTCMinutes() + offset)
  return boundary
}

const addIsoDateDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

const issueDueDateConditions = (input: ListIssuesInput): SQL[] => {
  const legacyOffset = input.dueDateOffsetMinutes ?? 0
  const fromOffset = input.dueDateFromOffsetMinutes ?? legacyOffset
  const toExclusiveOffset =
    input.dueDateToExclusiveOffsetMinutes ?? legacyOffset
  const exclusiveEnd = input.dueDateTo
    ? localDateBoundary(addIsoDateDays(input.dueDateTo, 1), toExclusiveOffset)
    : undefined
  return [
    input.dueDateFrom
      ? gte(issues.dueDate, localDateBoundary(input.dueDateFrom, fromOffset))
      : undefined,
    exclusiveEnd ? lt(issues.dueDate, exclusiveEnd) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined)
}

export const issueListConditions = (input: ListIssuesInput): SQL[] =>
  [
    eq(issues.organizationId, input.organizationId),
    issueSearchCondition(input),
    issueStatusCondition(input),
    ...issuePriorityConditions(input),
    issueAssigneeCondition(input),
    issueLabelCondition(input),
    ...issueDueDateConditions(input),
  ].filter((condition): condition is SQL => condition !== undefined)

export const issueListOrder = (input: ListIssuesInput): SQL[] => {
  const sortColumns = {
    number: issues.number,
    createdAt: issues.createdAt,
    updatedAt: issues.updatedAt,
    dueDate: issues.dueDate,
    priority: priorityRank,
    status: statusRank,
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
