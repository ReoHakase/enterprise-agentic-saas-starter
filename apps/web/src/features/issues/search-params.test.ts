import { describe, expect, it } from "vitest"

import {
  buildIssueListHref,
  createIssueTableSearchParams,
  defaultIssueSearchState,
  issueListQueryKeyState,
  loadIssueSearchParams,
  normalizeIssueSearchState,
  serializeIssueSearchParams,
  toIssueListRequest,
  withAgentThreadHref,
  type IssueSearchState,
} from "./search-params"

describe("Issue検索parameter", () => {
  it("prefixなしでは公開URL keyを使う", () => {
    const defaultParams = createIssueTableSearchParams()

    expect(defaultParams.urlKeys.q).toBe("q")
  })

  it.each([
    {
      caseLabel: "組織table",
      prefix: "org",
      state: { q: "billing", statuses: ["open", "closed"] },
      expected: "?org_q=billing&org_status=open&org_status=closed",
    },
    {
      caseLabel: "プロジェクトtable",
      prefix: "project",
      state: { q: "release", statuses: ["in_progress"] },
      expected: "?project_q=release&project_status=in_progress",
    },
  ])("$caseLabelではprefix付きURL keyを使う", ({ expected, prefix, state }) => {
    const params = createIssueTableSearchParams(prefix)

    expect(params.urlKeys.q).toBe(`${prefix}_q`)
    expect(params.serialize(state)).toBe(expected)
  })

  it.each([
    {
      caseLabel: "status集合",
      query: "?status=closed&status=open&status=closed&status=deleted",
      expected: { statuses: ["open", "closed"] },
    },
    {
      caseLabel: "逆転したpriority範囲",
      query: "?priorityFrom=urgent&priorityTo=low",
      expected: { priorityFrom: "low", priorityTo: "urgent" },
    },
    {
      caseLabel: "重複したassignee集合",
      query: "?assignee=user-2&assignee=user-2",
      expected: { assignees: ["user-2"] },
    },
    {
      caseLabel: "大文字小文字が重複したlabel集合",
      query: "?label=Bug&label=bug",
      expected: { labels: ["Bug"] },
    },
    {
      caseLabel: "上限を超えるpage",
      query: "?page=100001",
      expected: {},
    },
    {
      caseLabel: "未対応のpage size",
      query: "?pageSize=25",
      expected: {},
    },
  ])("$caseLabelを正規化する", ({ expected, query }) => {
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(query))

    expect(parsed).toEqual({
      ...defaultIssueSearchState,
      ...expected,
    })
  })

  it("境界offsetを分離せず逆転したURL期日範囲を拒否する", () => {
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

  it("旧形式の名前付きdue parameterを無視してserializeしない", () => {
    const parsed = normalizeIssueSearchState(
      loadIssueSearchParams("?due=overdue")
    )
    expect(toIssueListRequest("org-1", parsed)).not.toHaveProperty(
      "dueDatePreset"
    )
    const serialized = serializeIssueSearchParams(parsed)
    expect(serialized).not.toContain("due=")
  })

  it("削除された単一の優先順位キーを無視する", () => {
    const source = new URLSearchParams("priority=urgent")
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))

    expect(parsed.priorityFrom).toBe("no_priority")
    expect(parsed.priorityTo).toBe("urgent")
    expect(toIssueListRequest("org-1", parsed).priorityFrom).toBeUndefined()
  })

  it("APIリクエストとquery keyに同じ正規化済み値を使う", () => {
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

  it("表示したローカル日付境界を検証済みtimezone offset付きで送信する", () => {
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
  })

  it("廃止済みdueOffsetを無視する", () => {
    const source = new URLSearchParams(
      "dueFrom=2026-07-27&dueTo=2026-08-02&dueOffset=-540"
    )
    expect(
      normalizeIssueSearchState(loadIssueSearchParams(source))
    ).toMatchObject({
      dueFromOffset: 0,
      dueToOffset: 0,
    })
  })

  it("範囲外のtimezone offsetを拒否する", () => {
    const source = new URLSearchParams(
      "dueFrom=2026-07-27&dueTo=2026-08-02&dueFromOffset=900&dueToOffset=-900"
    )
    expect(
      normalizeIssueSearchState(loadIssueSearchParams(source))
    ).toMatchObject({
      dueFromOffset: 0,
      dueToOffset: 0,
    })
  })

  it("APIリクエスト構築前にassignee配列を50件へ制限する", () => {
    const assignees = Array.from(
      { length: 51 },
      (_, index) => `user-${(50 - index).toString().padStart(2, "0")}`
    )
    const source = new URLSearchParams()
    for (const assignee of assignees) source.append("assignee", assignee)
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))
    const request = toIssueListRequest("org-1", parsed)

    expect(request.assigneeIds).toHaveLength(50)
    expect(request.assigneeIds).toEqual(
      Array.from(
        { length: 50 },
        (_, index) => `user-${index.toString().padStart(2, "0")}`
      )
    )
    const serialized = new URLSearchParams(
      serializeIssueSearchParams({
        ...defaultIssueSearchState,
        assignees,
      })
    )
    expect(serialized.getAll("assignee")).toHaveLength(50)
  })

  it("APIリクエスト構築前にlabel配列を20件へ制限する", () => {
    const labels = Array.from(
      { length: 21 },
      (_, index) => `label-${(20 - index).toString().padStart(2, "0")}`
    )
    const source = new URLSearchParams()
    for (const label of labels) source.append("label", label)
    const parsed = normalizeIssueSearchState(loadIssueSearchParams(source))
    const request = toIssueListRequest("org-1", parsed)

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
        labels,
      })
    )
    expect(serialized.getAll("label")).toHaveLength(20)
  })

  it("デフォルト状態はIssue一覧URLへqueryを追加しない", () => {
    expect(serializeIssueSearchParams("/issues", defaultIssueSearchState)).toBe(
      "/issues"
    )
  })

  it("table状態をリセットしてもAgent threadを保持する", () => {
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
  })

  it("別featureのURLへAgent threadを追加する", () => {
    expect(withAgentThreadHref("/organization/acme/members", "thread-9")).toBe(
      "/organization/acme/members?agentThread=thread-9"
    )
  })
})
