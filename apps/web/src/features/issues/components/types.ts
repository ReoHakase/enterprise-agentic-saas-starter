import type {
  Issue,
  IssueComment,
  IssueListItem,
  IssuePriority,
  IssueStatus,
  UpdateIssueFormValues,
} from "../schema"
import type { IssueSearchState, SetIssueSearchState } from "../search-params"

export type { IssuePriority, IssueStatus }

export type IssueUiItem = Omit<Issue, "organizationId"> &
  Partial<Pick<IssueListItem, "attachmentCount" | "commentCount" | "thumbnail">>
export type IssueCommentUiItem = Omit<
  IssueComment,
  "organizationId" | "issueId"
>
export type IssueUpdate = Partial<UpdateIssueFormValues>

export type IssueAssigneeOption = {
  id: string
  name: string
  email: string
  profileImage?: string | null
}

export type AsyncAction<T extends unknown[]> = (
  ...input: T
) => void | Promise<void>

export type IssuesWorkspaceProps = {
  organizationId: string
  currentUserId?: string
  issues: IssueUiItem[]
  searchState: IssueSearchState
  total: number
  pageSize: 20 | 50 | 100
  pending?: boolean
  fetching?: boolean
  placeholder?: boolean
  busyIssueId?: string
  error?: string
  onCreate: AsyncAction<[title: string]>
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onDelete: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  assignees?: IssueAssigneeOption[]
  labelOptions?: string[]
  onLabelSearchChange?: (search: string) => void
  getIssueHref: (issue: IssueUiItem) => string
  onSelectIssue: (issue: IssueUiItem) => void
  onRetry?: () => void
  onSearchChange: (query: string) => void
  onViewChange: SetIssueSearchState
}
