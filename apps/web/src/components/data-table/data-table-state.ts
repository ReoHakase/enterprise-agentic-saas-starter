import type { RowSelectionState, VisibilityState } from "@tanstack/react-table"

type StorageReader = Pick<Storage, "getItem">

export type DataTablePageSize = "20" | "50" | "100"

export const toDataTablePageSize = (
  value: number
): DataTablePageSize | undefined => {
  if (value === 20) return "20"
  if (value === 50) return "50"
  if (value === 100) return "100"
  return undefined
}

export const getDataTableStorageKey = (
  userId: string,
  tableId: string,
  version = 1
) => `data-table:v${version}:${userId}:${tableId}`

export const pruneRowSelection = (
  selection: RowSelectionState,
  visibleRowIds: readonly string[]
) => {
  const visible = new Set(visibleRowIds)
  return Object.fromEntries(
    Object.entries(selection).filter(
      ([rowId, selected]) => selected && visible.has(rowId)
    )
  )
}

const normalizeColumnVisibility = (
  value: unknown,
  columnIds: readonly string[],
  nonHideableColumnIds: readonly string[]
): VisibilityState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const allowed = new Set(columnIds)
  const nonHideable = new Set(nonHideableColumnIds)
  return Object.fromEntries(
    Object.entries(value).flatMap(([columnId, visible]) =>
      allowed.has(columnId) &&
      !nonHideable.has(columnId) &&
      typeof visible === "boolean"
        ? [[columnId, visible]]
        : []
    )
  )
}

export const readColumnVisibility = (
  storage: StorageReader,
  storageKey: string,
  columnIds: readonly string[],
  nonHideableColumnIds: readonly string[]
) => {
  try {
    const stored = storage.getItem(storageKey)
    return stored
      ? normalizeColumnVisibility(
          JSON.parse(stored),
          columnIds,
          nonHideableColumnIds
        )
      : {}
  } catch {
    return {}
  }
}

export const getPaginationWindow = (
  pageIndex: number,
  pageCount: number,
  maximumVisiblePages = 5
) => {
  if (pageCount <= 0) return []
  const visibleCount = Math.min(maximumVisiblePages, pageCount)
  const half = Math.floor(visibleCount / 2)
  const start = Math.min(
    Math.max(pageIndex - half, 0),
    pageCount - visibleCount
  )
  return Array.from({ length: visibleCount }, (_, index) => start + index)
}
