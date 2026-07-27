import type { IssueUpdateField } from "../../issue-update-state"
import type { IssueTimelineItem } from "../../schema"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "../types/types"

export type ImmediateField =
  | "status"
  | "priority"
  | "assigneeId"
  | "labels"
  | "dueDate"

export type IssueDetailProps = {
  issue: IssueUiItem
  assignees?: IssueAssigneeOption[]
  labelSuggestions?: string[]
  timeline: IssueTimelineItem[]
  nextCursor: string | null
  canonicalHref: string
  organizationId?: string
  pending?: boolean
  pendingFields?: ReadonlySet<IssueUpdateField>
  loadingOlder?: boolean
  onLoadOlder: () => void
  onUpdate?: (
    issue: IssueUiItem,
    update: IssueUpdate
  ) => Promise<IssueUiItem | void>
  onCreateComment?: AsyncAction<[issue: IssueUiItem, body: string]>
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
  onFilesChanged?: () => Promise<void> | void
  onRequestClose: () => void
}

export const emptyPendingFields = new Set<IssueUpdateField>()
