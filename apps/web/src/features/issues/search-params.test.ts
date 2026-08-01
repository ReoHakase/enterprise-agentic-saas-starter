import { createLoader } from "nuqs/server"
import { describe, expect, it } from "vitest"

import {
  buildIssueListHref,
  createIssueTableSearchParams,
  defaultIssueSearchState,
  issueListQueryKeyState,
  issueSearchParsers,
  issueSearchUrlKeys,
  normalizeIssueSearchState,
  serializeIssueSearchParams,
  toIssueListRequest,
  withAgentThreadHref,
  type IssueSearchState,
} from "./search-params"

const loadIssueSearchParams = createLoader(issueSearchParsers, {
  urlKeys: issueSearchUrlKeys,
})

describe("issue search params", () => {
  it("uses unprefixed URL keys by default and supports two prefixed namespaces", () => {
    const defaultParams = createIssueTableSearchParams()
    const organizationParams = createIssueTableSearchParams("org")
    const projectParams = createIssueTableSearchParams("project")

    expect(defaultParams.urlKeys.q).toBe("q")
    expect(organizationParams.urlKeys.q).toBe("org_q")
    expect(projectParams.urlKeys.q).toBe("project_q")
    expect(
      organizationParams.serialize({
        q: "billing",
        statuses: ["open", "closed"],
      })
    ).toBe("?org_q=billing&org_status=open&org_status=closed")
    expect(
      projectParams.serialize({ q: "release", statuses: ["in_progress"] })
    ).toBe("?project_q=release&project_status=in_progress")
  })

  it("normalizes invalid, duplicate, and unordered URL values", () => {
    const parsed = normalizeIssueSearchState(
      loadIssueSearchParams(
        "?status=closed&status=open&status=closed&status=deleted&priorityFrom=urgent&priorityTo=low&assignee=user-2&assignee=user-2&label=Bug&label=bug&dueFrom=2026-08-10&dueTo=2026-08-01&pageSize=25&page=100001"
      )
    )

    expect(parsed).toEqual({
      ...defaultIssueSearchState,
      statuses: ["open", "closed"],
      priorityFrom: "low",
      priorityTo: "urgent",
      assignees: ["user-2"],
      labels: ["Bug"],
    })
  })

  it("rejects a reversed URL due range instead of detaching boundary offsets", () => {
    const source = new URLSearchParams(
      "dueFrom=2026-03-09&dueTo=2026-03-07&dueFromOffset=240&dueToOffset=300&due=next_7_days"
    )
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))

    expect(parsed).toMatchObject({
      dueFrom: "",
      dueTo: "",
      dueFromOffset: 0,
      dueToOffset: 0,
    })
    expect(toIssueListRequest("org-1", parsed)).not.toEqual(
      expect.objectContaining({
        dueDateFrom: expect.anything(),
        dueDateTo: expect.anything(),
      })
    )
  })

  it("ignores legacy named due params and never serializes them", () => {
    const parsed = normalizeIssueSearchState(
      loadIssueSearchParams("?due=overdue")
    )
    expect(toIssueListRequest("org-1", parsed)).not.toHaveProperty(
      "dueDatePreset"
    )
    const serialized = serializeIssueSearchParams(parsed)
    expect(serialized).not.toContain("due=")
    expect(issueSearchUrlKeys).not.toHaveProperty("duePreset")
  })

  it("ignores the removed singular priority key", () => {
    const source = new URLSearchParams("priority=urgent")
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))

    expect(parsed.priorityFrom).toBe("no_priority")
    expect(parsed.priorityTo).toBe("urgent")
    expect(toIssueListRequest("org-1", parsed).priorityFrom).toBeUndefined()
  })

  it("uses the same normalized values for the API request and query key", () => {
    const parsed = normalizeIssueSearchState(
      loadIssueSearchParams(
        "?q=%20billing%20&status=closed&status=open&priorityFrom=high&priorityTo=low&assignee=unassigned&assignee=user-2&label=bug&label=security&labelMode=all&due=overdue&sort=number&dir=asc&page=3&pageSize=50&agentThread=thread-9"
      )
    )

    expect(toIssueListRequest("org-1", parsed)).toEqual({
      organizationId: "org-1",
      search: "billing",
      statuses: ["open", "closed"],
      priorityFrom: "low",
      priorityTo: "high",
      assigneeIds: ["unassigned", "user-2"],
      labels: ["bug", "security"],
      labelMode: "all",
      sortBy: "number",
      sortDirection: "asc",
      page: 3,
      pageSize: 50,
    })
    expect(issueListQueryKeyState(parsed)).toEqual({
      q: "billing",
      statuses: ["open", "closed"],
      priorityFrom: "low",
      priorityTo: "high",
      assignees: ["unassigned", "user-2"],
      labels: ["bug", "security"],
      labelMode: "all",
      dueFrom: "",
      dueTo: "",
      dueFromOffset: 0,
      dueToOffset: 0,
      sort: "number",
      dir: "asc",
      page: 3,
      pageSize: 50,
    })
  })

  it("sends displayed local date bounds with their validated timezone offset", () => {
    const state = {
      ...defaultIssueSearchState,
      dueFrom: "2026-07-27",
      dueTo: "2026-08-02",
      dueFromOffset: -540,
      dueToOffset: -480,
    } satisfies IssueSearchState

    const request = toIssueListRequest("org-1", state)
    const queryKey = issueListQueryKeyState(state)
    expect({
      request: {
        dueFrom: request.dueDateFrom,
        dueTo: request.dueDateTo,
        dueFromOffset: request.dueDateFromOffsetMinutes,
        dueToOffset: request.dueDateToExclusiveOffsetMinutes,
      },
      queryKey: {
        dueFrom: queryKey.dueFrom,
        dueTo: queryKey.dueTo,
        dueFromOffset: queryKey.dueFromOffset,
        dueToOffset: queryKey.dueToOffset,
      },
    }).toEqual({
      request: {
        dueFrom: "2026-07-27",
        dueTo: "2026-08-02",
        dueFromOffset: -540,
        dueToOffset: -480,
      },
      queryKey: {
        dueFrom: "2026-07-27",
        dueTo: "2026-08-02",
        dueFromOffset: -540,
        dueToOffset: -480,
      },
    })
    const removed = new URLSearchParams(
      "dueFrom=2026-07-27&dueTo=2026-08-02&dueOffset=-540"
    )
    expect(
      normalizeIssueSearchState(loadIssueSearchParams(removed))
    ).toMatchObject({
      dueFromOffset: 0,
      dueToOffset: 0,
    })
    const invalid = new URLSearchParams(
      "dueFrom=2026-07-27&dueTo=2026-08-02&dueFromOffset=900&dueToOffset=-900"
    )
    expect(
      normalizeIssueSearchState(loadIssueSearchParams(invalid))
    ).toMatchObject({
      dueFromOffset: 0,
      dueToOffset: 0,
    })
  })

  it("bounds canonical assignee and label arrays before building the API request", () => {
    const assignees = Array.from(
      { length: 51 },
      (_, index) => `user-${(50 - index).toString().padStart(2, "0")}`
    )
    const labels = Array.from(
      { length: 21 },
      (_, index) => `label-${(20 - index).toString().padStart(2, "0")}`
    )
    const source = new URLSearchParams()
    for (const assignee of assignees) source.append("assignee", assignee)
    for (const label of labels) source.append("label", label)
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))
    const request = toIssueListRequest("org-1", parsed)

    expect(request.assigneeIds).toHaveLength(50)
    expect(request.assigneeIds).toEqual(
      Array.from(
        { length: 50 },
        (_, index) => `user-${index.toString().padStart(2, "0")}`
      )
    )
    expect(request.labels).toHaveLength(20)
    expect(request.labels).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `label-${index.toString().padStart(2, "0")}`
      )
    )
    const serialized = new URLSearchParams(
      serializeIssueSearchParams({
        ...defaultIssueSearchState,
        assignees,
        labels,
      })
    )
    expect(serialized.getAll("assignee")).toHaveLength(50)
    expect(serialized.getAll("label")).toHaveLength(20)
  })

  it("omits defaults and preserves the private Agent thread on reset", () => {
    expect(serializeIssueSearchParams("/issues", defaultIssueSearchState)).toBe(
      "/issues"
    )
    const current = {
      ...defaultIssueSearchState,
      statuses: ["open"],
      page: 4,
      agentThread: "thread-9",
    } satisfies IssueSearchState
    const { agentThread: _agentThread, ...tableDefaults } =
      defaultIssueSearchState

    expect(buildIssueListHref("acme", current, tableDefaults).state).toEqual({
      ...defaultIssueSearchState,
      agentThread: "thread-9",
    })
    expect(withAgentThreadHref("/organization/acme/members", "thread-9")).toBe(
      "/organization/acme/members?agentThread=thread-9"
    )
  })
})
