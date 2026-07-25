import type { OrganizationRole } from "../authorization/public"
import type {
  IssueCommentDto,
  IssueDto,
  IssueListItemDto,
  IssuePriority,
  IssueStatus,
  IssueThumbnailDto,
  IssueTimelinePageDto,
  ListIssuesInput,
} from "./domain"
import type { IssueTimelineCursorPosition } from "./timeline-cursor"

type IssueMembership = {
  id: string
  role: OrganizationRole
}

export type IssuesPorts = {
  deleteComment(input: {
    actorUserId: string
    commentId: string
    issueId: string
    organizationId: string
  }): Promise<IssueCommentDto | null>
  deleteIssue(input: {
    actorUserId: string
    id: string
    organizationId: string
  }): Promise<IssueDto | null>
  findComment(input: {
    commentId: string
    issueId: string
    organizationId: string
  }): Promise<IssueCommentDto | null>
  findIssue(input: {
    id: string
    organizationId: string
  }): Promise<IssueDto | null>
  findIssueByNumber(input: {
    number: number
    organizationId: string
  }): Promise<IssueDto | null>
  getMembership(input: {
    organizationId: string
    userId: string
  }): Promise<IssueMembership | null>
  getThumbnail(input: {
    issueId: string
    organizationId: string
  }): Promise<IssueThumbnailDto>
  insertComment(input: {
    authorId: string
    body: string
    issueId: string
    organizationId: string
  }): Promise<IssueCommentDto>
  insertIssue(input: {
    assigneeId: string | null
    creatorId: string
    description: string
    dueDate: Date | null
    labels: string[]
    organizationId: string
    priority: IssuePriority
    status: IssueStatus
    title: string
  }): Promise<IssueDto>
  listComments(input: {
    issueId: string
    organizationId: string
  }): Promise<IssueCommentDto[]>
  listIssues(
    input: Omit<ListIssuesInput, "limit"> & { page: number }
  ): Promise<{
    items: IssueListItemDto[]
    page: number
    pageSize: 10
    total: number
  }>
  listTimeline(input: {
    cursor?: IssueTimelineCursorPosition
    issueId: string
    limit: number
    organizationId: string
  }): Promise<IssueTimelinePageDto>
  requireMembership(input: {
    organizationId: string
    userId: string
  }): Promise<IssueMembership>
  setThumbnail(input: {
    actorUserId: string
    fileId: string | null
    issueId: string
    organizationId: string
  }): Promise<IssueThumbnailDto | null>
  updateComment(input: {
    actorUserId: string
    body: string
    commentId: string
    issueId: string
    organizationId: string
  }): Promise<IssueCommentDto | null>
  updateIssue(input: {
    actorUserId: string
    assigneeId?: string | null
    description?: string
    dueDate?: Date | null
    id: string
    labels?: string[]
    organizationId: string
    priority?: IssuePriority
    status?: IssueStatus
    title?: string
  }): Promise<IssueDto | null>
}
