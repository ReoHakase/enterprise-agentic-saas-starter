import { describe, expect, it } from "vitest"

import {
  getDataTableStorageKey,
  getPaginationWindow,
  pruneRowSelection,
  readColumnVisibility,
  toDataTablePageSize,
} from "./data-table-state"

describe("DataTableの状態", () => {
  it("選択状態を現在の結果ページに限定する", () => {
    expect(
      pruneRowSelection(
        { "issue-1": true, "issue-2": false, "issue-3": true },
        ["issue-1", "issue-2"]
      )
    ).toEqual({ "issue-1": true })
  })

  it.each([
    { caseLabel: "ページがない場合", current: 0, total: 0, expected: [] },
    { caseLabel: "2ページだけの場合", current: 0, total: 2, expected: [0, 1] },
    {
      caseLabel: "先頭ページの場合",
      current: 0,
      total: 10,
      expected: [0, 1, 2, 3, 4],
    },
    {
      caseLabel: "中間ページの場合",
      current: 5,
      total: 10,
      expected: [3, 4, 5, 6, 7],
    },
    {
      caseLabel: "末尾ページの場合",
      current: 9,
      total: 10,
      expected: [5, 6, 7, 8, 9],
    },
  ])(
    "$caseLabelは範囲を制限したページ一覧を返す",
    ({ current, expected, total }) => {
      expect(getPaginationWindow(current, total)).toEqual(expected)
    }
  )

  it.each([
    { caseLabel: "20件", value: 20, expected: "20" },
    { caseLabel: "50件", value: 50, expected: "50" },
    { caseLabel: "100件", value: 100, expected: "100" },
    { caseLabel: "未対応の10件", value: 10, expected: undefined },
  ])("$caseLabelのページサイズを正規化する", ({ expected, value }) => {
    expect(toDataTablePageSize(value)).toBe(expected)
  })

  it("版を含むユーザー別テーブルキーを構築する", () => {
    expect(getDataTableStorageKey("user-1", "issues")).toBe(
      "data-table:v1:user-1:issues"
    )
  })

  it("許可された任意列だけを復元する", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          title: false,
          status: false,
          unknown: false,
          actions: false,
        }),
    }
    expect(
      readColumnVisibility(
        storage,
        "ignored",
        ["title", "status", "actions"],
        ["title", "actions"]
      )
    ).toEqual({ status: false })
  })

  it.each([
    { caseLabel: "保存値がない場合", value: null },
    { caseLabel: "保存値が不正なJSONの場合", value: "{invalid" },
    { caseLabel: "保存値が配列の場合", value: JSON.stringify(["status"]) },
  ])("$caseLabelは空の表示状態を返す", ({ value }) => {
    expect(
      readColumnVisibility({ getItem: () => value }, "ignored", ["status"], [])
    ).toEqual({})
  })
})
