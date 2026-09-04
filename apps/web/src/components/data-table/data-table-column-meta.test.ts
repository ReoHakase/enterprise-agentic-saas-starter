import { describe, expect, it } from "vitest"

import { getDataTableColumnMeta } from "./data-table-column-meta"

describe("DataTableの列メタデータ", () => {
  it("サポートされている文字列フィールドのみを受け入れる", () => {
    expect(getDataTableColumnMeta(null)).toEqual({})
    expect(getDataTableColumnMeta("invalid")).toEqual({})
    expect(
      getDataTableColumnMeta({
        label: "Status",
        headerClassName: "w-20",
        cellClassName: "text-right",
        ignored: "not part of the contract",
      })
    ).toEqual({
      label: "Status",
      headerClassName: "w-20",
      cellClassName: "text-right",
    })
    expect(
      getDataTableColumnMeta({
        label: 1,
        headerClassName: false,
        cellClassName: null,
      })
    ).toEqual({
      label: undefined,
      headerClassName: undefined,
      cellClassName: undefined,
    })
  })
})
