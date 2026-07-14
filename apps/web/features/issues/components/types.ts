import type {
  Issue,
  IssueComment,
  IssuePriority,
  IssueStatus,
  UpdateIssueFormValues,
} from "@/features/issues/schema"

export type { IssuePriority, IssueStatus }

export type IssueUiItem = Omit<Issue, "organizationId">
export type IssueCommentUiItem = Omit<IssueComment, "organizationId" | "todoId">
export type IssueUpdate = Partial<UpdateIssueFormValues>

export type IssueAssigneeOption = {
  id: string
  name: string
  email: string
  image?: string | null
}

export type AsyncAction<T extends unknown[]> = (
  ...input: T
) => void | Promise<void>

export type IssuesWorkspaceProps = {
  issues: IssueUiItem[]
  pending?: boolean
  busyIssueId?: string
  error?: string
  onCreate: AsyncAction<[title: string]>
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onDelete: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  assignees?: IssueAssigneeOption[]
  selectedIssueId?: string | null
  onSelectIssue?: (issue?: IssueUiItem) => void
  comments?: IssueCommentUiItem[]
  commentsPending?: boolean
  commentsError?: string
  onCreateComment?: AsyncAction<[issue: IssueUiItem, body: string]>
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
  onRetry?: () => void
}
