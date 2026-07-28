import { createSerializer, parseAsInteger, parseAsString } from "nuqs/server"
import { describe, expect, it } from "vitest"

import { createDataTableUrlKeys } from "./data-table-url-state"

const parsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
}

describe("createDataTableUrlKeys", () => {
  it("keeps logical keys and adds one namespace separator", () => {
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

  it("updates and resets one namespace without removing other URL state", () => {
    const orgSerialize = createSerializer(parsers, {
      urlKeys: createDataTableUrlKeys(parsers, { prefix: "org" }),
    })
    const inventorySerialize = createSerializer(parsers, {
      urlKeys: createDataTableUrlKeys(parsers, { prefix: "inv" }),
    })
    const initial =
      "/issues?org_q=billing&org_page=2&inv_q=laptop&inv_page=4&agentThread=thread-9"

    const updated = orgSerialize(initial, { q: "security", page: 1 })
    expect(updated).toBe(
      "/issues?org_q=security&inv_q=laptop&inv_page=4&agentThread=thread-9"
    )
    expect(inventorySerialize(updated, { q: "", page: 1 })).toBe(
      "/issues?org_q=security&agentThread=thread-9"
    )
  })
})
