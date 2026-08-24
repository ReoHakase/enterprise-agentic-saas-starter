import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChangeEvent } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  defaultIssueSearchState,
  type IssueSearchState,
} from "../../search-params"
import type { IssueUiItem } from "../types"
import { useIssuesTableFilters } from "../use-issues-table-state/use-issues-table-state"
import { IssuesWorkspace } from "./issues-workspace"

const issue: IssueUiItem = {
  id: "issue-1",
  number: 1,
  title: "Verify issue controls",
  description: "",
  status: "open",
  priority: "medium",
  assigneeId: "user-1",
  creatorId: "user-1",
  labels: ["billing"],
  dueDate: null,
  revision: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
  attachmentCount: 0,
  commentCount: 0,
  thumbnail: null,
}
const assignees = [
  {
    id: "user-1",
    name: "Jordan",
    email: "jordan@example.test",
    profileImage: null,
  },
]
const issueValues = [issue]
const labelOptions = ["billing", "incident"]
const getIssueHref = (value: IssueUiItem) => `/issues/${value.number}`
const nonDefaultState: IssueSearchState = {
  ...defaultIssueSearchState,
  q: "billing",
  statuses: ["closed"],
  labels: ["security"],
  labelMode: "all",
  sort: "number",
  dir: "asc",
  page: 3,
  pageSize: "100",
  agentThread: "thread-9",
}
const activeSummaryState: IssueSearchState = {
  ...defaultIssueSearchState,
  statuses: ["open", "closed"],
  priorityFrom: "medium",
  priorityTo: "urgent",
  assignees: ["unassigned", "user-1"],
  labels: ["billing", "incident"],
  labelMode: "all",
  dueFrom: "2026-06-07",
  dueTo: "2026-06-18",
}
const filterDefaults = {
  statuses: [],
  priorityFrom: "no_priority",
  priorityTo: "urgent",
  assignees: [],
  labels: [],
  labelMode: "any",
  dueFrom: "",
  dueTo: "",
  dueFromOffset: 0,
  dueToOffset: 0,
  page: 1,
} as const

vi.mock("next/navigation", () => ({
  usePathname: () => "/organization/acme/issues",
}))

const createCallbacks = () => ({
  onCreate: vi.fn<(title: string) => Promise<void>>(),
  onToggle: vi.fn<(value: IssueUiItem) => Promise<void>>(),
  onDelete: vi.fn<(value: IssueUiItem) => Promise<void>>(),
  onUpdate: vi.fn<(value: IssueUiItem, update: object) => Promise<void>>(),
  onSelectIssue: vi.fn<(value: IssueUiItem) => void>(),
  onSearchChange: vi.fn<(query: string) => void>(),
  onViewChange: vi.fn<() => Promise<URLSearchParams>>(
    async () => new URLSearchParams()
  ),
})

const WorkspaceProbe = ({
  state = defaultIssueSearchState,
  callbacks,
}: {
  state?: IssueSearchState
  callbacks: ReturnType<typeof createCallbacks>
}) => (
  <IssuesWorkspace
    issues={issueValues}
    organizationId="org-1"
    currentUserId="user-1"
    searchState={state}
    total={1}
    pageSize={20}
    assignees={assignees}
    labelOptions={labelOptions}
    getIssueHref={getIssueHref}
    {...callbacks}
  />
)

afterEach(() => {
  vi.useRealTimers()
})

describe("Issue tableの高度なcontrol", () => {
  it("保留中の検索をキャンセルし、clearを1回通知する", () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn<(query: string) => void>()
    const onViewChange = vi.fn<() => Promise<URLSearchParams>>(
      async () => new URLSearchParams()
    )
    const { result } = renderHook(() =>
      useIssuesTableFilters({
        searchState: defaultIssueSearchState,
        onSearchChange,
        onViewChange,
      })
    )
    const inputView = render(<input aria-label="Search focus probe" />)
    const input = screen.getByLabelText<HTMLInputElement>("Search focus probe")
    const changeEvent: ChangeEvent<HTMLInputElement> = Object.create(null)
    Object.defineProperty(changeEvent, "target", { value: input })
    input.value = "billing"
    act(() => {
      result.current.searchInputRef.current = input
      result.current.handleSearchChange(changeEvent)
    })

    act(() => result.current.clearSearch())

    expect(result.current.searchDraft).toBe("")
    expect(onSearchChange).toHaveBeenCalledOnce()
    expect(onSearchChange).toHaveBeenCalledWith("")
    act(() => vi.advanceTimersByTime(300))
    expect(onSearchChange).toHaveBeenCalledOnce()
    inputView.unmount()
  })

  it("filterだけを既定値へリセットする", async () => {
    const user = userEvent.setup()
    const callbacks = createCallbacks()
    render(<WorkspaceProbe callbacks={callbacks} state={nonDefaultState} />)
    const resetFilters = screen.getByRole("button", {
      name: "Reset filters",
    })
    expect(resetFilters).toBeEnabled()

    await user.click(resetFilters)
    expect(callbacks.onViewChange).toHaveBeenCalledOnce()
    expect(callbacks.onViewChange).toHaveBeenCalledWith(filterDefaults)
    expect(resetFilters).toBeDisabled()
  })

  it("sortだけを既定値へリセットする", async () => {
    const user = userEvent.setup()
    const callbacks = createCallbacks()
    render(<WorkspaceProbe callbacks={callbacks} state={nonDefaultState} />)
    const resetSort = screen.getByRole("button", { name: "Reset sort" })
    expect(resetSort).toBeEnabled()

    await user.click(resetSort)
    expect(callbacks.onViewChange).toHaveBeenCalledOnce()
    expect(callbacks.onViewChange).toHaveBeenCalledWith({
      sort: "updatedAt",
      dir: "desc",
      page: 1,
    })
  })

  it("有効なfilterをアクセシブルな概要として説明する", () => {
    const callbacks = createCallbacks()
    render(<WorkspaceProbe callbacks={callbacks} state={activeSummaryState} />)

    const status = screen.getByRole("combobox", { name: "Status" })
    expect(status).toHaveAccessibleDescription(
      "Selected statuses: Open, Closed; 2 total"
    )
    const priority = screen.getByRole("button", { name: "Priority" })
    expect(priority).toHaveAccessibleDescription(
      "Selected priorities: Medium, High, Urgent; 3 total"
    )
    expect(
      screen.getByRole("button", { name: "Assignee" })
    ).toHaveAccessibleDescription(
      "Selected assignees: Unassigned, Jordan; 2 total"
    )
    expect(
      screen.getByRole("button", { name: "Labels" })
    ).toHaveAccessibleDescription(
      "Selected labels: billing, incident; 2 total; match all"
    )
    expect(
      screen.getByRole("button", { name: "Due date" })
    ).toHaveAccessibleDescription("Due date filter: Jun 7 – Jun 18")
  })

  it("選択件数を一意に表示してclearで解除する", async () => {
    const user = userEvent.setup()
    render(<WorkspaceProbe callbacks={createCallbacks()} />)

    await user.click(screen.getByRole("checkbox", { name: "Select issue 1" }))
    expect(screen.getByRole("status", { name: "1 selected" })).toBeVisible()
    expect(screen.getAllByText("1 selected")).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(
      screen.queryByRole("status", { name: "1 selected" })
    ).not.toBeInTheDocument()
  })
})
