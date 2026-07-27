import { describe, expect, it } from "vitest"

import {
  getDataTableStorageKey,
  getPaginationWindow,
  pruneRowSelection,
  readColumnVisibility,
} from "./data-table-state"

describe("DataTable state", () => {
  it("prunes selection to the current result page", () => {
    expect(
      pruneRowSelection(
        { "issue-1": true, "issue-2": false, "issue-3": true },
        ["issue-1", "issue-2"]
      )
    ).toEqual({ "issue-1": true })
  })

  it("builds bounded pagination windows at the start, middle, and end", () => {
    expect(getPaginationWindow(0, 0)).toEqual([])
    expect(getPaginationWindow(0, 2)).toEqual([0, 1])
    expect(getPaginationWindow(0, 10)).toEqual([0, 1, 2, 3, 4])
    expect(getPaginationWindow(5, 10)).toEqual([3, 4, 5, 6, 7])
    expect(getPaginationWindow(9, 10)).toEqual([5, 6, 7, 8, 9])
  })

  it("uses a versioned per-user table key and restores safe columns only", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          title: false,
          status: false,
          unknown: false,
          actions: false,
        }),
    }
    expect(getDataTableStorageKey("user-1", "issues")).toBe(
      "data-table:v1:user-1:issues"
    )
    expect(
      readColumnVisibility(
        storage,
        "ignored",
        ["title", "status", "actions"],
        ["title", "actions"]
      )
    ).toEqual({ status: false })
    expect(
      readColumnVisibility({ getItem: () => null }, "ignored", ["status"], [])
    ).toEqual({})
    expect(
      readColumnVisibility(
        { getItem: () => "{invalid" },
        "ignored",
        ["status"],
        []
      )
    ).toEqual({})
    expect(
      readColumnVisibility(
        { getItem: () => JSON.stringify(["status"]) },
        "ignored",
        ["status"],
        []
      )
    ).toEqual({})
  })
})
