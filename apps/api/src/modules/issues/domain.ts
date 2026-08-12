export type IssueStatus = "closed" | "in_progress" | "open"
export type IssuePriority = "high" | "low" | "medium" | "no_priority" | "urgent"

type IssueActivityField =
  | "assignee"
  | "description"
  | "due_date"
  | "labels"
  | "priority"
  | "status"
  | "title"
type IssueActivityKind =
  | "created"
  | "field_changed"
  | "file_added"
  | "file_deleted"
  | "legacy_updated"
type IssueActivityValue = null | string | string[]

export type IssueDto = {
  assigneeId: string | null
  createdAt: string
  creatorId: string
  description: string
  dueDate: string | null
  id: string
  labels: string[]
  number: number
  organizationId: string
  priority: IssuePriority
  revision: number
  status: IssueStatus
  title: string
  updatedAt: string
}

export type IssueThumbnailFileDto = {
  filename: string
  id: string
  imageHeight: number | null
  imageWidth: number | null
}

export type IssueThumbnailDto = {
  file: IssueThumbnailFileDto | null
  mode: "automatic" | "selected"
}

export type IssueListItemDto = IssueDto & {
  attachmentCount: number
  commentCount: number
  thumbnail: IssueThumbnailFileDto | null
}

export type IssueMutationAuditContext =
  | {
      actionId: string
      approvalMode: "auto_policy" | "manual"
      source: "agent"
    }
  | {
      actionId: string
      source: "mcp"
    }

export type IssueCommentDto = {
  author: {
    id: string
    name: string
    profileImage: string | null
  }
  authorId: string
  body: string
  createdAt: string
  id: string
  issueId: string
  organizationId: string
  updatedAt: string
}

type IssueActivityDto = {
  actor: { id: string | null; name: string; profileImage: string | null }
  createdAt: string
  field: IssueActivityField | null
  fromValue: IssueActivityValue
  id: string
  kind: IssueActivityKind
  toValue: IssueActivityValue
  type: "activity"
}

type IssueTimelineCommentDto = IssueCommentDto & { type: "comment" }
type IssueTimelineItemDto = IssueActivityDto | IssueTimelineCommentDto
export type IssueTimelinePageDto = {
  items: IssueTimelineItemDto[]
  nextCursor: string | null
}

export type ListIssuesInput = {
  assigneeId?: string
  assigneeIds?: string[]
  dueDateFrom?: string
  dueDateFromOffsetMinutes?: number
  dueDateOffsetMinutes?: number
  dueDateTo?: string
  dueDateToExclusiveOffsetMinutes?: number
  label?: string
  labelMode?: "all" | "any"
  labels?: string[]
  limit?: number
  organizationId: string
  pageSize?: 20 | 50 | 100
  priority?: IssuePriority
  priorityFrom?: IssuePriority
  priorityTo?: IssuePriority
  search?: string
  sortBy?:
    | "createdAt"
    | "dueDate"
    | "number"
    | "priority"
    | "status"
    | "updatedAt"
  sortDirection?: "asc" | "desc"
  status?: IssueStatus
  statuses?: IssueStatus[]
}
