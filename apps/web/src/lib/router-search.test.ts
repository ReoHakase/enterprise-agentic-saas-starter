import { describe, expect, it } from "vitest"

import { parseFlatSearch, stringifyFlatSearch } from "./router-search"

const signedOAuthSearch =
  "response_type=code&client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&exp=0001785726000&sig=signed-query&ba_param=client_id&ba_param=state"

describe("TanStack Router search serialization", () => {
  it.each([
    `/auth/sign-in?${signedOAuthSearch}`,
    `/oauth/organization?${signedOAuthSearch}`,
    "/organization/alpha-operations/issues?status=open&status=closed",
  ])(
    "Given opaqueまたは重複queryを持つ実URL, When Routerがparseして再構築する, Then raw queryを保持する: %s",
    (href) => {
      const url = new URL(href, "https://web.example.test")

      const search = parseFlatSearch(url.search)

      expect(stringifyFlatSearch(search)).toBe(url.search)
    }
  )

  it("Given 重複status filterを持つIssue URL, When Routerがparseする, Then 全status値を配列で渡す", () => {
    const url = new URL(
      "/organization/alpha-operations/issues?status=open&status=closed",
      "https://web.example.test"
    )

    const search = parseFlatSearch(url.search)

    expect(search.status).toEqual(["open", "closed"])
  })
})
