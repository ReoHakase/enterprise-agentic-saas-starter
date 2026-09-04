import { parseAsInteger, parseAsString } from "nuqs/server"
import { describe, expect, it } from "vitest"

import { createDataTableUrlKeys } from "./data-table-url-state"

const parsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
}

describe("createDataTableUrlKeysの契約", () => {
  it("論理キーを保持して名前空間の区切りを1つ追加する", () => {
    expect(createDataTableUrlKeys(parsers)).toEqual({ q: "q", page: "page" })
    expect(createDataTableUrlKeys(parsers, { prefix: "org" })).toEqual({
      q: "org_q",
      page: "org_page",
    })
    expect(createDataTableUrlKeys(parsers, { prefix: "inv_" })).toEqual({
      q: "inv_q",
      page: "inv_page",
    })
  })
})
