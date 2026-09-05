import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import type { IssueTimelineItem } from "../../schema"
import {
  defaultIssueSearchState,
  type IssueSearchState,
} from "../../search-params"
import { IssueDetailPage } from "../issue-detail-page/issue-detail-page"
import type { IssueUiItem } from "../types"
import { IssuesWorkspace } from "./issues-workspace"

const billingIssue: IssueUiItem = {
  id: "issue-billing",
  number: 12,
  title: "Fix billing webhook retries",
  description: "Retry failed invoice events with an idempotency key.",
  status: "open",
  priority: "urgent",
  assigneeId: "user-2",
  creatorId: "user-1",
  labels: ["billing", "bug"],
  dueDate: "2026-07-20T09:30:00.000Z",
  revision: 1,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  attachmentCount: 3,
  commentCount: 2,
  thumbnail: {
    id: "file-thumbnail",
    filename: "issue-thumbnail.png",
    imageWidth: 320,
    imageHeight: 180,
  },
}

const issues: IssueUiItem[] = [
  billingIssue,
  {
    ...billingIssue,
    id: "issue-access",
    number: 11,
    title: "Document role permissions",
    status: "closed",
    priority: "medium",
    labels: ["docs"],
    attachmentCount: 0,
    commentCount: 0,
    thumbnail: null,
  },
  {
    ...billingIssue,
    id: "issue-progress",
    number: 10,
    title: "Verify release candidate",
    status: "in_progress",
    priority: "high",
    labels: ["release"],
    attachmentCount: 0,
    commentCount: 0,
    thumbnail: null,
  },
]
const noIssues: IssueUiItem[] = []
const rerenderDefaultSearchState = { ...defaultIssueSearchState }
const refreshedIssues = [...issues]
const openIssueSearchState: IssueSearchState = {
  ...defaultIssueSearchState,
  statuses: ["open"],
}
const secondIssuePageSearchState: IssueSearchState = {
  ...defaultIssueSearchState,
  page: 2,
}
const fiftyIssuePageSizeSearchState: IssueSearchState = {
  ...defaultIssueSearchState,
  pageSize: "50",
}
const rerenderLabelOptions = ["incident", "security"]
const assignees = [
  {
    id: "user-2",
    name: "Jordan",
    email: "jordan@example.test",
    profileImage: null,
  },
  {
    id: "user-3",
    name: "Avery",
    email: "avery@example.test",
    profileImage: null,
  },
]

const createViewProps = (total: number) => ({
  organizationId: "org-1",
  searchState: defaultIssueSearchState,
  total,
  pageSize: 20 as const,
  onSearchChange: vi.fn<(query: string) => void>(),
  onViewChange: vi.fn<(...input: unknown[]) => Promise<URLSearchParams>>(
    async () => Promise.resolve(new URLSearchParams())
  ),
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    preload: _preload,
    to,
    ...props
  }: ComponentProps<"a"> & { preload?: boolean; to?: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => unknown
  }) => select({ pathname: "/organization/acme/issues" }),
}))

vi.mock("@/features/files", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/files")>()
  return {
    ...original,
    FileAttachments: () => (
      <section aria-label="Attachments">Attachments</section>
    ),
  }
})

const timeline: IssueTimelineItem[] = [
  {
    type: "activity",
    id: "activity-1",
    kind: "created",
    field: null,
    fromValue: null,
    toValue: null,
    actor: { id: "user-1", name: "Alex", profileImage: null },
    createdAt: "2026-07-10T00:00:00.000Z",
  },
  {
    type: "activity",
    id: "activity-2",
    kind: "field_changed",
    field: "status",
    fromValue: "open",
    toValue: "in_progress",
    actor: { id: "user-1", name: "Alex", profileImage: null },
    createdAt: "2026-07-11T00:00:00.000Z",
  },
  {
    type: "activity",
    id: "activity-3",
    kind: "field_changed",
    field: "assignee",
    fromValue: null,
    toValue: "user-2",
    actor: { id: "user-1", name: "Alex", profileImage: null },
    createdAt: "2026-07-11T01:00:00.000Z",
  },
  {
    type: "comment",
    id: "comment-1",
    organizationId: "org-1",
    issueId: billingIssue.id,
    authorId: "user-2",
    author: { id: "user-2", name: "Jordan", profileImage: null },
    body: "Verified in staging.",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  },
]

const createWorkspaceProps = (issueValues = issues) => ({
  onCreate: vi.fn<(title: string) => Promise<void>>(),
  onToggle: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
  onDelete: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
  onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
  assignees,
  currentUserId: "user-2",
  labelOptions: ["incident", "billing"],
  onLabelSearchChange: vi.fn<(search: string) => void>(),
  getIssueHref: (issue: IssueUiItem) =>
    `/organization/acme/issues/${issue.number.toString()}`,
  onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
  ...createViewProps(issueValues.length),
})

const renderWorkspace = (issueValues = issues) => {
  const callbacks = createWorkspaceProps(issueValues)
  render(<IssuesWorkspace issues={issueValues} {...callbacks} />)
  return callbacks
}
const getIssue12Selection = () =>
  screen.getByRole("checkbox", { name: "Select issue 12" })

const renderDetail = () => {
  const callbacks = {
    onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
    onCreateComment:
      vi.fn<(issue: IssueUiItem, body: string) => Promise<void>>(),
    onUpdateComment:
      vi.fn<
        (issue: IssueUiItem, commentId: string, body: string) => Promise<void>
      >(),
    onDeleteComment:
      vi.fn<(issue: IssueUiItem, commentId: string) => Promise<void>>(),
    onRequestClose: vi.fn<() => void>(),
    onLoadOlder: vi.fn<() => void>(),
  }
  render(
    <IssueDetailPage
      issue={billingIssue}
      timeline={timeline}
      nextCursor="2026-07-09T00:00:00.000Z"
      canonicalHref="/organization/acme/issues/12"
      organizationId="org-1"
      assignees={assignees}
      {...callbacks}
    />
  )
  return callbacks
}

const selectOption = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  name: string | RegExp,
  assertOption?: (option: HTMLElement) => void
) => {
  await user.click(trigger)
  const option = await waitFor(() => {
    const clickableOption = screen
      .getAllByRole("option", { name })
      .find((candidate) => getComputedStyle(candidate).pointerEvents !== "none")
    expect(clickableOption).toBeDefined()
    if (!clickableOption) {
      throw new Error(
        `Expected a clickable select option named ${name.toString()}`
      )
    }
    return clickableOption
  })
  assertOption?.(option)
  await user.click(option)
}

describe("組織のIssue", () => {
  it("要求された列と公開値を含むIssue tableを描画する", () => {
    renderWorkspace()

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    expect(headers.slice(0, 10)).toEqual([
      "",
      "#",
      "Thumbnail",
      "Name",
      "Status",
      "Priority",
      "Assignee",
      "Due date and time",
      "Comments",
      "Files",
    ])
    expect(screen.getByRole("button", { name: "Number" })).toHaveTextContent(
      "#"
    )
    expect(screen.getByText("#12")).toBeInTheDocument()
    expect(screen.getByAltText("issue-thumbnail.png")).toBeInTheDocument()
    expect(screen.getByLabelText("2 comments")).toHaveTextContent("2")
    expect(screen.getByLabelText("3 files")).toHaveTextContent("3")
    const emptyCountRow = screen.getByRole("row", {
      name: /Document role permissions/u,
    })
    const emptyCells = within(emptyCountRow).getAllByRole("cell")
    expect(emptyCells[8]).toBeEmptyDOMElement()
    expect(emptyCells[9]).toBeEmptyDOMElement()
    expect(screen.getByText("Showing 1–3 of 3 matching issues")).toBeVisible()
  })

  it("検索とfilterとsort controlをsemanticなtoolbarへ構成する", () => {
    renderWorkspace()

    const search = screen.getByRole("searchbox", { name: "Search issues" })
    const columns = screen.getByRole("button", {
      name: "Choose visible columns",
    })
    const toolbar = screen.getByRole("toolbar", {
      name: "Issue table controls",
    })
    const groups = within(toolbar).getAllByRole("group", {
      name: /^Issue (filters|sorting)$/u,
    })
    expect(groups).toHaveLength(2)
    const filterGroup = within(toolbar).getByRole("group", {
      name: "Issue filters",
    })
    const sortGroup = within(toolbar).getByRole("group", {
      name: "Issue sorting",
    })
    expect(
      within(filterGroup).getByRole("combobox", { name: "Status" })
    ).toBeVisible()
    expect(
      within(sortGroup).getByRole("combobox", { name: "Sort issues" })
    ).toBeVisible()
    expect(toolbar).toContainElement(search)
    expect(toolbar).not.toContainElement(columns)
  })

  it("入力確定後にIssue検索を通知する", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()
    const search = screen.getByRole("searchbox", { name: "Search issues" })

    await user.type(search, "billing")
    expect(search).toHaveValue("billing")
    expect(screen.getByText(billingIssue.title)).toBeInTheDocument()
    expect(callbacks.onSearchChange).not.toHaveBeenCalled()
    await waitFor(() => expect(callbacks.onSearchChange).toHaveBeenCalledOnce())
    expect(callbacks.onSearchChange).toHaveBeenCalledWith("billing")
  })

  it("labelをremote検索し、filterを閉じたときURL差分を1回だけ適用する", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "Labels" }))
    await user.type(
      await screen.findByRole("combobox", { name: "Search labels" }),
      "incident"
    )
    expect(callbacks.onLabelSearchChange).toHaveBeenLastCalledWith("incident")
    expect(callbacks.onViewChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Match all" }))
    await user.click(screen.getByRole("option", { name: /incident/u }))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(callbacks.onViewChange).toHaveBeenCalledOnce())
    expect(callbacks.onViewChange.mock.calls[0]?.[0]).toMatchObject({
      labels: ["incident"],
      labelMode: "all",
      page: 1,
    })
  })

  it("ハイドレーション前は実hrefを保持し、完了後はURL状態を使う", async () => {
    const user = userEvent.setup()
    const callbacks = {
      onCreate: vi.fn<(title: string) => Promise<void>>(),
      onToggle: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onDelete: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
      assignees,
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      ...createViewProps(42),
      searchState: {
        ...defaultIssueSearchState,
        q: "tenant audit",
        statuses: ["open"],
        agentThread: "agent-thread-1",
      },
    }
    render(<IssuesWorkspace issues={issues} {...callbacks} />)

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled()
    const next = screen.getByRole("link", { name: "Next" })
    const href = new URL(
      next.getAttribute("href") ?? "",
      "https://enterprise-agentic-saas.localhost"
    )
    expect(href.pathname).toBe("/organization/acme/issues")
    expect(href.searchParams.get("q")).toBe("tenant audit")
    expect(href.searchParams.get("status")).toBe("open")
    expect(href.searchParams.get("agentThread")).toBe("agent-thread-1")
    expect(href.searchParams.get("page")).toBe("2")

    await user.keyboard("{Control>}")
    await user.click(next)
    await user.keyboard("{/Control}")
    expect(callbacks.onViewChange).not.toHaveBeenCalled()

    await user.click(next)
    expect(callbacks.onViewChange).toHaveBeenCalledWith({ page: 2 })
  })

  it("faceted status filterをURL状態へcommitする", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("combobox", { name: "Status" }))
    await user.click(await screen.findByRole("option", { name: "In progress" }))
    await user.keyboard("{Escape}")
    expect(callbacks.onViewChange.mock.calls[0]?.[0]).toMatchObject({
      statuses: ["in_progress"],
      page: 1,
    })
  })

  it("現在の担当者だけをYouとして表示して選択する", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "Assignee" }))
    expect(await screen.findByText("You")).toBeVisible()
    expect(screen.getAllByText("You")).toHaveLength(1)
    const assigneeFilter = screen.getByRole("dialog", {
      name: "Assignee filter",
    })
    const currentAssignee = within(assigneeFilter).getByLabelText("Jordan You")
    expect(currentAssignee).toHaveTextContent("Jordan")
    expect(currentAssignee).toHaveTextContent("You")
    await user.click(
      within(assigneeFilter).getByRole("option", { name: "Unassigned" })
    )
    await user.keyboard("{Escape}")
    expect(callbacks.onViewChange).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ["unassigned"], page: 1 })
    )
  })
})

describe("組織Issue tableの状態", () => {
  it("remote optionの再描画時も開いているlabel draftを上書きしない", async () => {
    const user = userEvent.setup()
    const callbacks = {
      onCreate: vi.fn<(title: string) => Promise<void>>(),
      onToggle: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onDelete: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
      assignees,
      currentUserId: "user-2",
      labelOptions: ["incident"],
      onLabelSearchChange: vi.fn<(search: string) => void>(),
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      ...createViewProps(issues.length),
    }
    const view = render(<IssuesWorkspace issues={issues} {...callbacks} />)

    await user.click(screen.getByRole("button", { name: "Labels" }))
    await screen.findByText("incident")
    await user.click(screen.getByRole("option", { name: /incident/u }))
    view.rerender(
      <IssuesWorkspace
        issues={issues}
        {...callbacks}
        searchState={rerenderDefaultSearchState}
        labelOptions={rerenderLabelOptions}
      />
    )
    await user.keyboard("{Escape}")

    await waitFor(() => expect(callbacks.onViewChange).toHaveBeenCalledOnce())
    expect(callbacks.onViewChange).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["incident"], page: 1 })
    )
  })

  it("組織scope変更時に実データ行の選択を消去する", async () => {
    const user = userEvent.setup()
    const callbacks = {
      onCreate: vi.fn<(title: string) => Promise<void>>(),
      onToggle: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onDelete: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
      onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
      assignees,
      currentUserId: "user-2",
      labelOptions: ["incident"],
      onLabelSearchChange: vi.fn<(search: string) => void>(),
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      ...createViewProps(issues.length),
    }
    const view = render(<IssuesWorkspace issues={issues} {...callbacks} />)
    const firstIssue = screen.getByRole("checkbox", {
      name: "Select issue 12",
    })
    await user.click(firstIssue)
    expect(firstIssue).toBeChecked()
    const selectedRow = screen.getByRole("row", {
      name: /Fix billing webhook retries/u,
    })
    expect(selectedRow).toHaveAttribute("data-state", "selected")
    expect(screen.getByText("1 selected")).toBeVisible()

    view.rerender(
      <IssuesWorkspace issues={issues} {...callbacks} organizationId="org-2" />
    )
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Select issue 12" })
      ).not.toBeChecked()
    )
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
  })

  it("同じquery scopeの再取得では選択を保持する", async () => {
    const user = userEvent.setup()
    const callbacks = createWorkspaceProps()
    const view = render(<IssuesWorkspace issues={issues} {...callbacks} />)

    await user.click(getIssue12Selection())
    view.rerender(
      <IssuesWorkspace
        issues={refreshedIssues}
        {...callbacks}
        searchState={rerenderDefaultSearchState}
      />
    )
    await waitFor(() => expect(getIssue12Selection()).toBeChecked())
  })

  it.each([
    { caseLabel: "status変更", searchState: openIssueSearchState },
    { caseLabel: "page変更", searchState: secondIssuePageSearchState },
    {
      caseLabel: "page size変更",
      searchState: fiftyIssuePageSizeSearchState,
    },
  ])(
    "$caseLabelでquery scopeが変わると選択を消去する",
    async ({ searchState }) => {
      const user = userEvent.setup()
      const callbacks = createWorkspaceProps()
      const view = render(<IssuesWorkspace issues={issues} {...callbacks} />)

      await user.click(getIssue12Selection())
      view.rerender(
        <IssuesWorkspace
          issues={issues}
          {...callbacks}
          searchState={searchState}
        />
      )
      await waitFor(() => expect(getIssue12Selection()).not.toBeChecked())
    }
  )
})

describe("組織Issueの操作", () => {
  it("優先度範囲をURL状態へcommitする", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "Priority" }))
    await user.click(await screen.findByRole("button", { name: "Only High" }))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(callbacks.onViewChange).toHaveBeenCalledOnce())
    expect(callbacks.onViewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        priorityFrom: "high",
        priorityTo: "high",
        page: 1,
      })
    )
  })

  it("期日範囲をURL状態へcommitする", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "Due date" }))
    const month = new Date().toLocaleDateString("en-US", { month: "long" })
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(`${month} 10`, "u"),
      })
    )
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`${month} 11`, "u"),
      })
    )
    await user.keyboard("{Escape}")
    await waitFor(() => expect(callbacks.onViewChange).toHaveBeenCalledOnce())
    expect(callbacks.onViewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dueFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
        dueTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
        page: 1,
      })
    )
  })

  it("ページサイズをURL状態へcommitする", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await selectOption(
      user,
      screen.getByRole("combobox", { name: "Issues per page" }),
      "50 / page"
    )
    expect(callbacks.onViewChange).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: "50",
    })
  })

  it("直前の行を表示したままアクセシブルな取得中spinnerを重ねる", () => {
    render(
      <IssuesWorkspace issues={issues} {...createWorkspaceProps()} fetching />
    )

    expect(screen.getByText(billingIssue.title)).toBeVisible()
    expect(
      screen.getByRole("status", { name: "Updating issues" })
    ).toBeVisible()
    expect(screen.getByLabelText("Issue table")).toHaveAttribute(
      "aria-busy",
      "true"
    )
  })

  it("新しいquery結果が届くまでplaceholder行を読み取り専用にする", async () => {
    const callbacks = createWorkspaceProps()
    const view = render(
      <IssuesWorkspace issues={issues} {...callbacks} fetching placeholder />
    )

    expect(screen.getByText(billingIssue.title)).toBeVisible()
    expect(
      screen.getByRole("status", { name: "Updating issues" })
    ).toBeVisible()
    expect(
      screen.getByRole("checkbox", { name: "Select issue 12" })
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("combobox", {
        name: `Status for ${billingIssue.title}`,
      })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: `Actions for ${billingIssue.title}`,
      })
    ).toBeDisabled()

    view.rerender(<IssuesWorkspace issues={issues} {...callbacks} />)
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Select issue 12" })
      ).not.toHaveAttribute("aria-disabled", "true")
    )
    expect(
      screen.getByRole("button", {
        name: `Actions for ${billingIssue.title}`,
      })
    ).toBeEnabled()
  })

  it("非表示にできる列だけを列メニューへ表示する", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    const trigger = screen.getByRole("button", {
      name: "Choose visible columns",
    })
    await user.click(trigger)
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Thumbnail" })
    ).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Number" })
    ).toBeVisible()
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Name" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Actions" })
    ).not.toBeInTheDocument()
  })

  it("新しいIssueを作成する", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "New issue" }))
    await user.type(screen.getByLabelText("Title"), "Prepare launch")
    await user.click(screen.getByRole("button", { name: "Create issue" }))
    expect(callbacks.onCreate).toHaveBeenCalledWith("Prepare launch")
  })

  it("Issue詳細を開く", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    expect(
      screen.getByRole("link", { name: billingIssue.title })
    ).toHaveAttribute("href", "/organization/acme/issues/12")

    await user.click(
      screen.getByRole("button", { name: `Actions for ${billingIssue.title}` })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "View details" })
    )
    expect(callbacks.onSelectIssue).toHaveBeenCalledWith(billingIssue)
  })

  it("Issueを削除する", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(
      screen.getByRole("button", { name: `Actions for ${billingIssue.title}` })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete issue" })
    )
    await user.click(screen.getByRole("button", { name: "Delete issue" }))
    expect(callbacks.onDelete).toHaveBeenCalledWith(billingIssue)
  })

  it("空状態の指標を表示する", () => {
    const callbacks = {
      onCreate: vi.fn<(title: string) => void>(),
      onToggle: vi.fn<(issue: IssueUiItem) => void>(),
      onDelete: vi.fn<(issue: IssueUiItem) => void>(),
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      onRetry: vi.fn<() => void>(),
      ...createViewProps(0),
    }
    render(<IssuesWorkspace issues={noIssues} {...callbacks} />)
    expect(screen.getByText("No matching issues")).toBeInTheDocument()
    expect(
      within(screen.getByLabelText("Issue status summary")).getAllByText("0")
    ).toHaveLength(3)
  })

  it("Issue取得エラーを再試行する", async () => {
    const user = userEvent.setup()
    const callbacks = {
      onCreate: vi.fn<(title: string) => void>(),
      onToggle: vi.fn<(issue: IssueUiItem) => void>(),
      onDelete: vi.fn<(issue: IssueUiItem) => void>(),
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      onRetry: vi.fn<() => void>(),
      ...createViewProps(0),
    }
    render(
      <IssuesWorkspace
        issues={noIssues}
        error="Request failed"
        {...callbacks}
      />
    )

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(callbacks.onRetry).toHaveBeenCalledOnce()
  })

  it("Issue詳細のdiscussionへactivity timelineを構成する", () => {
    renderDetail()

    expect(screen.getByRole("region", { name: "Discussion" })).toContainElement(
      screen.getByText("created this issue")
    )
  })

  it("過去のactivityを追加取得する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(screen.getByRole("button", { name: "Load older" }))
    expect(callbacks.onLoadOlder).toHaveBeenCalledOnce()
  })

  it("Issueの題名を編集する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(screen.getByRole("button", { name: "Edit issue title" }))
    const title = screen.getByLabelText("Issue title")
    const saveTitle = screen.getByRole("button", { name: "Save title" })
    expect(saveTitle).toBeDisabled()
    await user.clear(title)
    await user.type(title, "Fix payment retries")
    await user.tab()
    expect(callbacks.onUpdate).not.toHaveBeenCalled()
    expect(saveTitle).toBeEnabled()
    await user.click(saveTitle)
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      title: "Fix payment retries",
    })
  })

  it("Issueの説明を編集する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(screen.getByRole("button", { name: "Edit description" }))
    const description = screen.getByRole("textbox", { name: "Description" })
    const saveDescription = screen.getByRole("button", {
      name: "Save description",
    })
    expect(saveDescription).toBeDisabled()
    await user.clear(description)
    await user.type(description, "Retry safely and report failures.")
    expect(saveDescription).toBeEnabled()
    await user.click(saveDescription)
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      description: "Retry safely and report failures.",
    })
  })

  it("Issueのstatusを更新する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await selectOption(
      user,
      screen.getByRole("combobox", { name: "Issue status" }),
      "In progress"
    )
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      status: "in_progress",
    })
  })

  it("Issueへlabelを追加する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.type(
      screen.getByRole("combobox", { name: "Search or create a label" }),
      "compliance"
    )
    await user.click(
      screen.getByRole("button", { name: "Add label compliance" })
    )
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      labels: ["billing", "bug", "compliance"],
    })
  })

  it("Issueの期日を更新する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    const currentDueDate = billingIssue.dueDate
    if (!currentDueDate)
      throw new Error("Expected the fixture to have a due date")
    const nextDueHour = ((new Date(currentDueDate).getHours() + 1) % 24)
      .toString()
      .padStart(2, "0")
    await user.click(
      screen.getByRole("button", { name: "Issue due date and time" })
    )
    expect(screen.getByRole("grid")).toBeVisible()
    expect(screen.getByRole("combobox", { name: "Due hour" })).toBeVisible()
    expect(screen.getByRole("combobox", { name: "Due minute" })).toBeVisible()
    callbacks.onUpdate.mockClear()
    await selectOption(
      user,
      screen.getByRole("combobox", { name: "Due hour" }),
      nextDueHour
    )
    expect(callbacks.onUpdate).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    expect(callbacks.onUpdate).toHaveBeenCalledOnce()
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      dueDate: expect.any(String),
    })
    const dueDateUpdate = callbacks.onUpdate.mock.calls[0]?.[1]
    if (
      !dueDateUpdate ||
      !("dueDate" in dueDateUpdate) ||
      typeof dueDateUpdate.dueDate !== "string"
    ) {
      throw new Error("Expected a due date update")
    }
    expect(new Date(dueDateUpdate.dueDate).getHours()).toBe(Number(nextDueHour))
  })

  it("Issueへコメントを作成する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.type(screen.getByLabelText("Add comment"), "Ready to ship")
    await user.click(screen.getByRole("button", { name: "Comment" }))
    expect(callbacks.onCreateComment).toHaveBeenCalledWith(
      billingIssue,
      "Ready to ship"
    )
  })

  it("Issue詳細のsemantic領域を順序どおり構成する", () => {
    renderDetail()

    screen.getByRole("complementary", {
      name: "Issue metadata",
    })
    const primaryColumn = screen.getByRole("group", {
      name: "Issue primary content",
    })
    const description = screen.getByRole("region", {
      name: "Description",
    })
    const discussion = screen.getByRole("region", {
      name: "Discussion",
    })
    const attachments = screen.getByRole("region", {
      name: "Attachments",
    })
    expect(primaryColumn).toContainElement(description)
    expect(primaryColumn).toContainElement(attachments)
    expect(primaryColumn).toContainElement(discussion)
    expect(
      description.compareDocumentPosition(attachments) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      attachments.compareDocumentPosition(discussion) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("Issue詳細のheaderとmetadataを公開値で表示する", () => {
    renderDetail()

    const description = screen.getByRole("region", {
      name: "Description",
    })
    expect(
      screen.getByRole("heading", { name: billingIssue.title, level: 1 })
    ).toBeInTheDocument()
    expect(screen.getByText("#12")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Open full page" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Back to issues" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Edit issue title" })
    ).toBeInTheDocument()
    expect(within(description).getByText(/created at/)).toBeInTheDocument()
    expect(within(description).getByText(/updated at/)).toBeInTheDocument()
    expect(within(description).queryByText("Former member")).toBeNull()
  })

  it("失敗した即時フィールド更新を未処理の拒否なしで解決する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()
    callbacks.onUpdate.mockRejectedValueOnce(
      new Error("Injected update failure")
    )

    const status = screen.getByRole("combobox", { name: "Issue status" })
    await selectOption(user, status, "In progress")

    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      status: "in_progress",
    })
    await waitFor(() => expect(status).toHaveAttribute("aria-busy", "false"))
  })

  it("未保存の下書きでページ全体を終了する前に確認する", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()
    await user.type(screen.getByLabelText("Add comment"), "Keep this draft")
    await user.click(screen.getByRole("button", { name: "Back to issues" }))

    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.getByLabelText("Add comment")).toHaveValue("Keep this draft")
    expect(callbacks.onRequestClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Back to issues" }))
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(callbacks.onRequestClose).toHaveBeenCalledOnce()
  })

  it("全画面表示でブラウザーのBackにも同じ破棄dialogを使う", async () => {
    const user = userEvent.setup()
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined)
    renderDetail()

    await user.type(screen.getByLabelText("Add comment"), "Keep this draft")
    act(() => window.dispatchEvent(new PopStateEvent("popstate")))
    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.getByLabelText("Add comment")).toHaveValue("Keep this draft")
    expect(historyBack).not.toHaveBeenCalled()

    act(() => window.dispatchEvent(new PopStateEvent("popstate")))
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" })
    )
    await waitFor(() => expect(historyBack).toHaveBeenCalledOnce())
    historyBack.mockRestore()
  })
})
