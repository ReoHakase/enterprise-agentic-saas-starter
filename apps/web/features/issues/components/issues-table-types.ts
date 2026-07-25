import type { IssueSearchState, SetIssueSearchState } from "../search-params"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

export type IssuesTableProps = {
  organizationId: string
  issues: IssueUiItem[]
  searchState: IssueSearchState
  total: number
  pageSize: number
  pending?: boolean
  busyIssueId?: string
  error?: string
  assignees: IssueAssigneeOption[]
  getIssueHref: (issue: IssueUiItem) => string
  onCreate: AsyncAction<[title: string]>
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onDelete: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRetry?: () => void
  onSearchChange: (query: string) => void
  onViewChange: SetIssueSearchState
}
