import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { getDataTableStorageKey } from "./data-table-state"
import { useDataTableColumnVisibility } from "./use-data-table-column-visibility"

const columnIds = ["title", "status", "actions"] as const
const nonHideableColumnIds = ["title", "actions"] as const
const defaultVisibility = { status: true }

const useVisibility = (userId: string) =>
  useDataTableColumnVisibility({
    userId,
    tableId: "issues",
    columnIds,
    nonHideableColumnIds,
    defaultVisibility,
    storageVersion: 2,
  })

describe("useDataTableColumnVisibilityの契約", () => {
  beforeEach(() => window.localStorage.clear())

  it("現在のユーザー設定を復元する", async () => {
    const key = getDataTableStorageKey("user-1", "issues", 2)
    window.localStorage.setItem(key, JSON.stringify({ status: false }))
    const { result } = renderHook(() => useVisibility("user-1"))

    await waitFor(() =>
      expect(result.current.columnVisibility).toEqual({ status: false })
    )
  })

  it("列の表示変更を現在のユーザー設定へ保存する", () => {
    const key = getDataTableStorageKey("user-1", "issues", 2)
    const { result } = renderHook(() => useVisibility("user-1"))

    act(() => result.current.onColumnVisibilityChange({ status: true }))
    expect(window.localStorage.getItem(key)).toBe(
      JSON.stringify({ status: true })
    )
  })

  it("列の表示設定を初期値へ戻して保存値を削除する", async () => {
    const key = getDataTableStorageKey("user-1", "issues", 2)
    window.localStorage.setItem(key, JSON.stringify({ status: false }))
    const { result } = renderHook(() => useVisibility("user-1"))

    await waitFor(() =>
      expect(result.current.columnVisibility).toEqual({ status: false })
    )

    act(() => result.current.resetColumnVisibility())
    expect(result.current.columnVisibility).toEqual(defaultVisibility)
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it("認証されたユーザーごとに設定を分離する", async () => {
    const userOneKey = getDataTableStorageKey("user-1", "issues", 2)
    const userTwoKey = getDataTableStorageKey("user-2", "issues", 2)
    window.localStorage.setItem(userOneKey, JSON.stringify({ status: false }))
    window.localStorage.setItem(userTwoKey, JSON.stringify({ status: true }))
    const { result, rerender } = renderHook(
      ({ userId }) => useVisibility(userId),
      { initialProps: { userId: "user-1" } }
    )

    await waitFor(() =>
      expect(result.current.columnVisibility.status).toBe(false)
    )
    rerender({ userId: "user-2" })
    await waitFor(() =>
      expect(result.current.columnVisibility.status).toBe(true)
    )
    expect(window.localStorage.getItem(userOneKey)).toBe(
      JSON.stringify({ status: false })
    )
  })

  it("以前のストレージ版を無視する", async () => {
    const oldKey = getDataTableStorageKey("user-1", "issues")
    const currentKey = getDataTableStorageKey("user-1", "issues", 2)
    window.localStorage.setItem(oldKey, JSON.stringify({ status: false }))
    const { result } = renderHook(() => useVisibility("user-1"))

    await waitFor(() =>
      expect(result.current.columnVisibility).toEqual(defaultVisibility)
    )
    expect(result.current.storageKey).toBe(currentKey)
    expect(window.localStorage.getItem(oldKey)).not.toBeNull()
    expect(window.localStorage.getItem(currentKey)).toBeNull()
  })
})
