"use client"

import type { OnChangeFn, VisibilityState } from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  getDataTableStorageKey,
  readColumnVisibility,
} from "./data-table-state"

export const useDataTableColumnVisibility = ({
  userId,
  tableId,
  columnIds,
  nonHideableColumnIds,
  defaultVisibility = {},
  storageVersion = 1,
}: {
  userId: string
  tableId: string
  columnIds: readonly string[]
  nonHideableColumnIds: readonly string[]
  defaultVisibility?: VisibilityState
  storageVersion?: number
}) => {
  const storageKey = useMemo(
    () => getDataTableStorageKey(userId, tableId, storageVersion),
    [storageVersion, tableId, userId]
  )
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility)
  const columnVisibilityRef = useRef(columnVisibility)

  useEffect(() => {
    const next = {
      ...defaultVisibility,
      ...readColumnVisibility(
        window.localStorage,
        storageKey,
        columnIds,
        nonHideableColumnIds
      ),
    }
    columnVisibilityRef.current = next
    setColumnVisibility(next)
  }, [columnIds, defaultVisibility, nonHideableColumnIds, storageKey])

  const onColumnVisibilityChange = useCallback<OnChangeFn<VisibilityState>>(
    (updater) => {
      const next =
        typeof updater === "function"
          ? updater(columnVisibilityRef.current)
          : updater
      columnVisibilityRef.current = next
      setColumnVisibility(next)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // preference storageが利用できない場合も、column visibilityは利用可能な状態を維持する。
      }
    },
    [storageKey]
  )
  const resetColumnVisibility = useCallback(() => {
    columnVisibilityRef.current = defaultVisibility
    setColumnVisibility(defaultVisibility)
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // Reset remains usable when preference storage is blocked.
    }
  }, [defaultVisibility, storageKey])

  return {
    columnVisibility,
    onColumnVisibilityChange,
    resetColumnVisibility,
    storageKey,
  }
}
