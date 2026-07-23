import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  fileCleanupJobs,
  files,
  issueActivityEvents,
  issueFileOwners,
  issueThumbnailSelections,
  member,
  issueComments,
  issues,
  organizationFileUsage,
  type IssueActivityField,
  type IssueActivityKind,
  type IssueActivityValue,
  type IssuePriority,
  type IssueStatus,
  user,
} from "@enterprise-agentic-saas/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  lt,
  max,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import {
  isPreviewableImageFormat,
  previewableImageFormats,
} from "../files/constants"
import { getFileOwnerAdapter } from "../files/owner-adapters"
import { releaseDeletedFileStorageObjectsInTransaction } from "../files/storage-object-release"
import {
  encodeIssueTimelineCursor,
  type IssueTimelineCursorPosition,
  type IssueTimelineItemType,
} from "./timeline-cursor"

export type IssueDto = {
  id: string
  organizationId: string
  number: number
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  creatorId: string
  labels: string[]
  dueDate: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type IssueThumbnailFileDto = {
  id: string
  filename: string
  imageWidth: number | null
  imageHeight: number | null
}

export type IssueThumbnailDto = {
  mode: "automatic" | "selected"
  file: IssueThumbnailFileDto | null
}

export type IssueListItemDto = IssueDto & {
  attachmentCount: number
  commentCount: number
  thumbnail: IssueThumbnailFileDto | null
}

export type IssueMutationAuditContext = {
  source: "agent"
  approvalMode: "manual" | "auto_policy"
  actionId: string
}

export type IssueCommentDto = {
  id: string
  organizationId: string
  issueId: string
  authorId: string
  author: {
    id: string
    name: string
    profileImage: string | null
  }
  body: string
  createdAt: string
  updatedAt: string
}

export type IssueActivityDto = {
  type: "activity"
  id: string
  kind: IssueActivityKind
  field: IssueActivityField | null
  fromValue: IssueActivityValue
  toValue: IssueActivityValue
  actor: { id: string | null; name: string; profileImage: string | null }
  createdAt: string
}

export type IssueTimelineCommentDto = IssueCommentDto & { type: "comment" }
export type IssueTimelineItemDto = IssueActivityDto | IssueTimelineCommentDto
export type IssueTimelinePageDto = {
  items: IssueTimelineItemDto[]
  nextCursor: string | null
}

type OrderedIssueTimelineItem = {
  item: IssueTimelineItemDto
  position: number
}

const timelineItemTypeOrder: Record<IssueTimelineItemType, number> = {
  activity: 0,
  comment: 1,
}

const compareTextDescending = (left: string, right: string) => {
  if (left === right) return 0
  return left < right ? 1 : -1
}

const combineAllConditions = (...conditions: SQL[]) =>
  and(...conditions) ?? sql`false`

const combineAnyConditions = (...conditions: SQL[]) =>
  or(...conditions) ?? sql`false`

const compareTimelineItemsDescending = (
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

type IssueRow = typeof issues.$inferSelect
type IssueCommentRow = typeof issueComments.$inferSelect
export type IssueTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

const issueAuditMetadata = (
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

type IssueCommentWithAuthorRow = IssueCommentRow & {
  authorUserId: string | null
  authorName: string | null
  authorProfileImage: string | null
}

const toIssueDto = (issue: IssueRow): IssueDto => ({
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

const toIssueCommentDto = (
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

const issueCommentSelection = {
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

const tenantSafeAuthorJoin = and(
  eq(user.id, issueComments.authorId),
  sql`exists (
    select 1
    from ${member}
    where ${member.userId} = ${issueComments.authorId}
      and ${member.organizationId} = ${issueComments.organizationId}
  )`
)

const ISSUE_LIST_PAGE_SIZE = 10

export type ListIssuesInput = {
  organizationId: string
  search?: string
  status?: IssueStatus
  priority?: IssuePriority
  assigneeId?: string
  label?: string
  sortBy?:
    | "number"
    | "createdAt"
    | "updatedAt"
    | "dueDate"
    | "priority"
    | "status"
  sortDirection?: "asc" | "desc"
  limit?: number
}

type IssueReadDatabase = Pick<Db, "select">

const issueListConditions = (input: ListIssuesInput): SQL[] => {
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

const issueListOrder = (input: ListIssuesInput): SQL[] => {
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

const findEffectiveIssueThumbnail = async (
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

const loadIssueListSummaries = async (
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

export const listIssuesByOrganization = async (
  db: IssueReadDatabase,
  input: ListIssuesInput
): Promise<IssueDto[]> => {
  try {
    const rows = await db
      .select()
      .from(issues)
      .where(and(...issueListConditions(input)))
      .orderBy(...issueListOrder(input))
      .limit(input.limit ?? 50)

    return rows.map(toIssueDto)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "listIssuesByOrganization",
    })
  }
}

export const listIssuePageByOrganization = async (
  db: Db,
  input: Omit<ListIssuesInput, "limit"> & { page: number }
): Promise<{
  items: IssueListItemDto[]
  page: number
  pageSize: typeof ISSUE_LIST_PAGE_SIZE
  total: number
}> => {
  try {
    return await db.transaction(async (tx) => {
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
          .limit(ISSUE_LIST_PAGE_SIZE)
          .offset((input.page - 1) * ISSUE_LIST_PAGE_SIZE),
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
        pageSize: ISSUE_LIST_PAGE_SIZE,
        total: Number(countRows[0]?.total ?? 0),
      }
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "listIssuePageByOrganization",
    })
  }
}

export const getEffectiveIssueThumbnail = async (
  db: Db,
  input: { issueId: string; organizationId: string }
): Promise<IssueThumbnailDto> => {
  try {
    return await findEffectiveIssueThumbnail(db, input)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "getEffectiveIssueThumbnail",
    })
  }
}

export const setIssueThumbnail = async (
  db: Db,
  input: {
    actorUserId: string
    fileId: string | null
    issueId: string
    organizationId: string
    now?: Date
  }
): Promise<IssueThumbnailDto | null> => {
  try {
    return await db.transaction(async (tx) => {
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
          throw publicErrors.notFound("File not found", { resource: "file" })
        }
        if (!isPreviewableImageFormat(candidate.detectedImageFormat)) {
          throw publicErrors.validation(
            "Thumbnail must be a previewable image",
            {
              field: "fileId",
              reason: "not_previewable",
            }
          )
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
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "setIssueThumbnail",
    })
  }
}

export const findIssueById = async (
  db: IssueReadDatabase,
  input: { id: string; organizationId: string }
): Promise<IssueDto | null> => {
  try {
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
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "findIssueById",
    })
  }
}

export const findIssueByNumber = async (
  db: IssueReadDatabase,
  input: { number: number; organizationId: string }
): Promise<IssueDto | null> => {
  try {
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
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "findIssueByNumber",
    })
  }
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
): Promise<IssueDto> => {
  try {
    return await withIssueNumberLock(input.organizationId, async () => {
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
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "insertIssue",
    })
  }
}

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
  try {
    const row = await db.transaction((tx) =>
      updateIssueInTransaction(tx, input)
    )
    return row ? toIssueDto(row) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "updateIssueById",
    })
  }
}

export const listIssueTimeline = async (
  db: Db,
  input: {
    organizationId: string
    issueId: string
    cursor?: IssueTimelineCursorPosition
    limit: number
  }
): Promise<IssueTimelinePageDto> => {
  try {
    const activityConditions = [
      eq(issueActivityEvents.organizationId, input.organizationId),
      eq(issueActivityEvents.issueId, input.issueId),
    ]
    const commentConditions = [
      eq(issueComments.organizationId, input.organizationId),
      eq(issueComments.issueId, input.issueId),
    ]
    if (input.cursor) {
      const cursor = input.cursor
      const activityCursorConditions: SQL[] = [
        lt(issueActivityEvents.createdAt, cursor.createdAt),
        combineAllConditions(
          eq(issueActivityEvents.createdAt, cursor.createdAt),
          lt(issueActivityEvents.position, cursor.position)
        ),
        combineAllConditions(
          eq(issueActivityEvents.createdAt, cursor.createdAt),
          eq(issueActivityEvents.position, cursor.position),
          lt(issueActivityEvents.id, cursor.id)
        ),
      ]
      if (timelineItemTypeOrder.activity < timelineItemTypeOrder[cursor.type]) {
        activityCursorConditions.push(
          combineAllConditions(
            eq(issueActivityEvents.createdAt, cursor.createdAt),
            eq(issueActivityEvents.position, cursor.position),
            eq(issueActivityEvents.id, cursor.id)
          )
        )
      }
      activityConditions.push(combineAnyConditions(...activityCursorConditions))

      const commentCursorConditions: SQL[] = [
        lt(issueComments.createdAt, cursor.createdAt),
      ]
      if (cursor.position > 0) {
        commentCursorConditions.push(
          eq(issueComments.createdAt, cursor.createdAt)
        )
      } else {
        commentCursorConditions.push(
          combineAllConditions(
            eq(issueComments.createdAt, cursor.createdAt),
            lt(issueComments.id, cursor.id)
          )
        )
      }
      commentConditions.push(combineAnyConditions(...commentCursorConditions))
    }

    const [activities, comments] = await Promise.all([
      db
        .select({
          id: issueActivityEvents.id,
          kind: issueActivityEvents.kind,
          field: issueActivityEvents.field,
          fromValue: issueActivityEvents.fromValue,
          toValue: issueActivityEvents.toValue,
          actorUserId: issueActivityEvents.actorUserId,
          actorId: user.id,
          actorName: user.name,
          actorProfileImage: user.image,
          position: issueActivityEvents.position,
          createdAt: issueActivityEvents.createdAt,
        })
        .from(issueActivityEvents)
        .leftJoin(
          user,
          and(
            eq(user.id, issueActivityEvents.actorUserId),
            sql`exists (
              select 1 from ${member}
              where ${member.userId} = ${issueActivityEvents.actorUserId}
                and ${member.organizationId} = ${issueActivityEvents.organizationId}
            )`
          )
        )
        .where(and(...activityConditions))
        .orderBy(
          desc(issueActivityEvents.createdAt),
          desc(issueActivityEvents.position),
          desc(issueActivityEvents.id)
        )
        .limit(input.limit + 1),
      db
        .select(issueCommentSelection)
        .from(issueComments)
        .leftJoin(user, tenantSafeAuthorJoin)
        .where(and(...commentConditions))
        .orderBy(desc(issueComments.createdAt), desc(issueComments.id))
        .limit(input.limit + 1),
    ])

    const items: OrderedIssueTimelineItem[] = [
      ...activities.map(
        (activity): OrderedIssueTimelineItem => ({
          position: activity.position,
          item: {
            type: "activity",
            id: activity.id,
            kind: activity.kind,
            field: activity.field,
            fromValue: activity.fromValue ?? null,
            toValue: activity.toValue ?? null,
            actor: {
              id: activity.actorId,
              name:
                activity.actorId && activity.actorName
                  ? activity.actorName
                  : "Former member",
              profileImage: activity.actorId
                ? activity.actorProfileImage
                : null,
            },
            createdAt: activity.createdAt.toISOString(),
          },
        })
      ),
      ...comments.map((comment): OrderedIssueTimelineItem => {
        const dto = toIssueCommentDto(comment)
        return {
          position: 0,
          item: {
            type: "comment",
            id: dto.id,
            organizationId: dto.organizationId,
            issueId: dto.issueId,
            authorId: dto.authorId,
            author: dto.author,
            body: dto.body,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt,
          },
        }
      }),
    ].toSorted(compareTimelineItemsDescending)
    const pageItems = items.slice(0, input.limit)
    const hasMore = items.length > input.limit
    const oldest = pageItems.at(-1)

    return {
      items: pageItems.map(({ item }) => item),
      nextCursor:
        hasMore && oldest
          ? encodeIssueTimelineCursor({
              type: oldest.item.type,
              createdAt: new Date(oldest.item.createdAt),
              position: oldest.position,
              id: oldest.item.id,
            })
          : null,
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "issues",
      operation: "listIssueTimeline",
    })
  }
}

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
