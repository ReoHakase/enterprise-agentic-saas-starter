"use client"

import type { OnChangeFn, VisibilityState } from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useState } from "react"

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

  useEffect(() => {
    setColumnVisibility({
      ...defaultVisibility,
      ...readColumnVisibility(
        window.localStorage,
        storageKey,
        columnIds,
        nonHideableColumnIds
      ),
    })
  }, [columnIds, defaultVisibility, nonHideableColumnIds, storageKey])

  const onColumnVisibilityChange = useCallback<OnChangeFn<VisibilityState>>(
    (updater) => {
      setColumnVisibility((current) => {
        const next = typeof updater === "function" ? updater(current) : updater
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // Column visibility remains usable when preference storage is blocked.
        }
        return next
      })
    },
    [storageKey]
  )
  const resetColumnVisibility = useCallback(() => {
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
