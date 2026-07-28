import type { IssueSearchState, SetIssueSearchState } from "../../search-params"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "../types/types"

export type IssuesTableProps = {
  organizationId: string
  currentUserId: string
  issues: IssueUiItem[]
  searchState: IssueSearchState
  total: number
  pageSize: 20 | 50 | 100
  pending?: boolean
  fetching?: boolean
  placeholder?: boolean
  busyIssueId?: string
  error?: string
  assignees: IssueAssigneeOption[]
  labelOptions: string[]
  onLabelSearchChange: (search: string) => void
  enableRowSelection?: boolean
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
