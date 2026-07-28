import type { IssueSearchState } from "../../search-params"
import type { IssueUiItem } from "../types/types"

export const getIssueRowId = (issue: IssueUiItem) => issue.id

export const tableSortOptions = [
  { label: "Updated", value: "updatedAt" },
  { label: "Created", value: "createdAt" },
  { label: "Number", value: "number" },
  { label: "Due date", value: "dueDate" },
  { label: "Priority", value: "priority" },
  { label: "Status", value: "status" },
] as const

export const tableDirectionOptions = [
  { label: "Descending", value: "desc" },
  { label: "Ascending", value: "asc" },
] as const

export const isTableSort = (
  value: string | null
): value is IssueSearchState["sort"] =>
  value === "number" ||
  value === "createdAt" ||
  value === "updatedAt" ||
  value === "dueDate" ||
  value === "priority" ||
  value === "status"
