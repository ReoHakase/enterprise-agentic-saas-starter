import { describe, expect, it } from "vitest"

import {
  defaultIssueSearchState,
  issueListQueryKeyState,
  loadIssueSearchParams,
  mergeIssueSearchPatch,
  serializeIssueSearchParams,
  toIssueListRequest,
  withAgentThreadHref,
} from "./search-params"

describe("issue search params", () => {
  it("normalizes invalid and missing URL values to safe defaults", () => {
    expect(
      loadIssueSearchParams(
        "?status=deleted&priority=critical&sort=title&dir=sideways&page=100001"
      )
    ).toEqual(defaultIssueSearchState)
  })

  it("uses the same normalized object for the API request and query key", () => {
    const parsed = loadIssueSearchParams(
      "?q=%20billing%20&status=open&priority=urgent&assignee=user-2&label=bug&sort=number&dir=asc&page=3&agentThread=thread-9"
    )

    expect(toIssueListRequest("org-1", parsed)).toEqual({
      organizationId: "org-1",
      search: "billing",
      status: "open",
      priority: "urgent",
      assigneeId: "user-2",
      label: "bug",
      sortBy: "number",
      sortDirection: "asc",
      page: 3,
    })
    expect(issueListQueryKeyState(parsed)).toEqual({
      q: "billing",
      status: "open",
      priority: "urgent",
      assignee: "user-2",
      label: "bug",
      sort: "number",
      dir: "asc",
      page: 3,
    })
  })

  it("omits defaults from shareable URLs", () => {
    expect(serializeIssueSearchParams("/issues", defaultIssueSearchState)).toBe(
      "/issues"
    )
  })

  it("preserves the private Agent thread through same-tenant navigation", () => {
    const current = {
      ...defaultIssueSearchState,
      status: "open" as const,
      page: 4,
      agentThread: "thread-9",
    }

    expect(mergeIssueSearchPatch(current, { priority: "urgent" })).toEqual({
      ...current,
      priority: "urgent",
      page: 1,
    })
    expect(withAgentThreadHref("/organization/acme/members", "thread-9")).toBe(
      "/organization/acme/members?agentThread=thread-9"
    )
    expect(
      withAgentThreadHref("/organization/acme/issues?status=open", "thread/9")
    ).toBe("/organization/acme/issues?status=open&agentThread=thread%2F9")
  })
})
