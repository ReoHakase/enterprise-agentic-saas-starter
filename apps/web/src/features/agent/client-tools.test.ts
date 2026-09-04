import { afterEach, describe, expect, it, vi } from "vitest"

import {
  defaultIssueSearchState,
  type IssueSearchState,
} from "@/features/issues"

import { executeAgentClientTool } from "./client-tools"

const dependencies = () => {
  const issueSearchState: IssueSearchState = {
    ...defaultIssueSearchState,
    statuses: ["open"],
    page: 8,
    agentThread: "thread-1",
  }
  return {
    organizationId: "org-1",
    organizationSlug: "acme",
    frozen: false,
    navigate: vi.fn<(href: string) => void>(),
    issueSearchState,
    readForm: vi.fn<
      () => {
        formId: string
        resource: "issue"
        resourceId: string
        revision: number
        epoch: string
        values: { title: string }
        dirtyFields: ["title"]
      }
    >(() => ({
      formId: "issue:1",
      resource: "issue" as const,
      resourceId: "issue-1",
      revision: 3,
      epoch: "epoch-1",
      values: { title: "Draft" },
      dirtyFields: ["title" as const],
    })),
    patchForm: vi.fn<
      () => Promise<{
        formId: string
        resource: "issue"
        resourceId: string
        revision: number
        epoch: string
        values: { title: string }
        dirtyFields: ["title"]
      }>
    >(async () => ({
      formId: "issue:1",
      resource: "issue" as const,
      resourceId: "issue-1",
      revision: 3,
      epoch: "epoch-1",
      values: { title: "Patched" },
      dirtyFields: ["title" as const],
    })),
  }
}

describe("Agent client toolの契約", () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    {
      toolName: "ui_navigate",
      input: { page: "members" },
      href: "/organization/acme/members?agentThread=thread-1",
    },
    {
      toolName: "ui_open_issue",
      input: { issueNumber: 42 },
      href: "/organization/acme/issues/42?agentThread=thread-1",
    },
  ])("ツール出力が返されるまで $toolName を延期する", async (testCase) => {
    vi.useFakeTimers()
    const deps = dependencies()

    await expect(
      executeAgentClientTool(testCase.toolName, testCase.input, deps)
    ).resolves.toEqual({ ok: true })
    expect(deps.navigate).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    expect(deps.navigate).toHaveBeenCalledWith(testCase.href)
  })

  it("部分的なqueryを統合し、ページをリセットして正規のIssueへ遷移する", async () => {
    vi.useFakeTimers()
    const deps = dependencies()
    const expectedQuery = {
      q: "",
      status: "open",
      priority: "high" as const,
      assignee: "",
      label: "",
      sort: "updatedAt",
      dir: "desc",
      page: 1,
    }
    await expect(
      executeAgentClientTool(
        "ui_set_issue_query",
        { query: { priority: "high" } },
        deps
      )
    ).resolves.toEqual({
      ok: true,
      query: expectedQuery,
    })
    expect(deps.navigate).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    expect(deps.navigate).toHaveBeenCalledWith(
      "/organization/acme/issues?status=open&priorityFrom=high&priorityTo=high&agentThread=thread-1"
    )
  })

  it("Agent スレッドを保持しながらフィルターのデフォルトを削除する", async () => {
    vi.useFakeTimers()
    const deps = dependencies()
    deps.issueSearchState = {
      ...defaultIssueSearchState,
      page: 9,
      agentThread: "thread-1",
    }

    await executeAgentClientTool(
      "ui_set_issue_query",
      {
        query: {
          q: "",
          status: "all",
          priority: "all",
          assignee: "",
          label: "",
          sort: "updatedAt",
          dir: "desc",
        },
      },
      deps
    )
    await vi.runAllTimersAsync()

    expect(deps.navigate).toHaveBeenCalledWith(
      "/organization/acme/issues?agentThread=thread-1"
    )
  })

  it("従来のツールでは表現できない高度なクエリ状態をクリアする", async () => {
    vi.useFakeTimers()
    const deps = dependencies()
    deps.issueSearchState = {
      ...defaultIssueSearchState,
      statuses: ["open", "closed"],
      priorityFrom: "low",
      priorityTo: "high",
      assignees: ["user-1", "user-2"],
      labels: ["bug", "security"],
      labelMode: "all",
      pageSize: "100",
      page: 4,
      agentThread: "thread-1",
    }

    await expect(
      executeAgentClientTool("ui_set_issue_query", { query: {} }, deps)
    ).resolves.toEqual({
      ok: true,
      query: {
        q: "",
        status: "all",
        priority: "all",
        assignee: "",
        label: "",
        sort: "updatedAt",
        dir: "desc",
        page: 1,
      },
    })
    await vi.runAllTimersAsync()

    expect(deps.navigate).toHaveBeenCalledWith(
      "/organization/acme/issues?agentThread=thread-1"
    )
  })

  it("未許可のツールや操作対象を拒否する", async () => {
    const deps = dependencies()
    await expect(executeAgentClientTool("ui_eval", {}, deps)).rejects.toThrow(
      "not allowlisted"
    )
    await expect(
      executeAgentClientTool("ui_navigate", { page: "settings" }, deps)
    ).rejects.toThrow("Invalid input")
    await expect(
      executeAgentClientTool(
        "ui_set_issue_query",
        { query: { page: 100_001 } },
        deps
      )
    ).rejects.toThrow("Invalid input")
    await expect(
      executeAgentClientTool(
        "ui_patch_form_draft",
        {
          formId: "issue:1",
          expectedEpoch: "epoch-1",
          patch: { title: "Missing revision" },
        },
        deps
      )
    ).rejects.toThrow("Invalid input")
  })

  it("マウント済みregistryから取得した完全一致のフォームとepochだけにpatchを適用する", async () => {
    const deps = dependencies()

    await executeAgentClientTool(
      "ui_patch_form_draft",
      {
        formId: "issue:1",
        expectedEpoch: "epoch-1",
        expectedRevision: 3,
        patch: { title: "Agent title" },
      },
      deps
    )

    expect(deps.patchForm).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        formId: "issue:1",
        expectedEpoch: "epoch-1",
        expectedRevision: 3,
      },
      { title: "Agent title" }
    )
  })

  it("組織切替barrierが凍結中は失敗時に拒否する", async () => {
    await expect(
      executeAgentClientTool(
        "ui_navigate",
        { page: "issues" },
        {
          ...dependencies(),
          frozen: true,
        }
      )
    ).rejects.toThrow("switching")
  })
})
