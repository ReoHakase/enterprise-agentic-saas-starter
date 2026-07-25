import type { IssueSearchState } from "../../search-params"
import type { IssueUiItem } from "../types/types"

export const getIssueRowId = (issue: IssueUiItem) => issue.id

export const issueColumnClassName = (columnId: string) => {
  if (columnId === "number") return "w-14 max-w-14 px-2"
  if (columnId === "thumbnail") return "w-20 min-w-20 px-2"
  if (columnId === "comments" || columnId === "files") {
    return "w-20 min-w-20 text-center"
  }
  if (columnId === "actions") return "w-12"
  return undefined
}

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
