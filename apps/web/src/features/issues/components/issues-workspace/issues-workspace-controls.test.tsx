import { act, render, renderHook, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChangeEvent } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  defaultIssueSearchState,
  type IssueSearchState,
} from "../../search-params"
import type { IssueUiItem } from "../types/types"
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

describe("issue table advanced controls", () => {
  it("cancels a pending search, emits one clear, and refocuses the input", () => {
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
    expect(input).toHaveFocus()
    expect(onSearchChange).toHaveBeenCalledOnce()
    expect(onSearchChange).toHaveBeenCalledWith("")
    act(() => vi.advanceTimersByTime(300))
    expect(onSearchChange).toHaveBeenCalledOnce()
    inputView.unmount()
  })

  it("keeps filter and sort resets scoped and disables default groups", async () => {
    const user = userEvent.setup()
    const callbacks = createCallbacks()
    const view = render(<WorkspaceProbe callbacks={callbacks} />)
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Reset sort" })).toBeDisabled()

    view.rerender(
      <WorkspaceProbe callbacks={callbacks} state={nonDefaultState} />
    )
    const resetFilters = screen.getByRole("button", {
      name: "Reset filters",
    })
    const resetSort = screen.getByRole("button", { name: "Reset sort" })
    expect(resetFilters).toBeEnabled()
    expect(resetSort).toBeEnabled()
    for (const name of ["Issue filter actions", "Issue sort actions"]) {
      const actions = screen.getByRole("group", { name })
      expect(actions).toHaveClass("ml-auto", "shrink-0")
      expect(actions).not.toHaveClass("basis-full")
    }

    await user.click(resetFilters)
    expect(callbacks.onViewChange).toHaveBeenCalledOnce()
    expect(callbacks.onViewChange).toHaveBeenCalledWith(filterDefaults)
    expect(resetFilters).toBeDisabled()

    callbacks.onViewChange.mockClear()
    await user.click(resetSort)
    expect(callbacks.onViewChange).toHaveBeenCalledOnce()
    expect(callbacks.onViewChange).toHaveBeenCalledWith({
      sort: "updatedAt",
      dir: "desc",
      page: 1,
    })
  })

  it("owns accessible summaries and places the column menu in the 48px actions header", () => {
    const callbacks = createCallbacks()
    render(<WorkspaceProbe callbacks={callbacks} state={activeSummaryState} />)

    const status = screen.getByRole("combobox", { name: "Status" })
    expect(status).toHaveAccessibleDescription(
      "Selected statuses: Open, Closed; 2 total"
    )
    expect(
      within(status).getAllByTestId("issue-filter-summary-dot")
    ).toHaveLength(2)
    const priority = screen.getByRole("button", { name: "Priority" })
    expect(priority).toHaveAccessibleDescription(
      "Selected priorities: Medium, High, Urgent; 3 total"
    )
    expect(
      within(priority).getAllByTestId("issue-filter-summary-dot")
    ).toHaveLength(3)
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

    const header = screen.getByRole("columnheader", {
      name: "Actions",
    })
    expect(header).toHaveClass("w-12", "min-w-12", "max-w-12", "p-0")
    const columns = within(header).getByRole("button", {
      name: "Choose visible columns",
    })
    expect(columns).not.toHaveTextContent("Columns")
    expect(columns).toHaveClass("ring-border")
    expect(columns).not.toHaveClass("ring-primary", "text-primary")
    expect(
      screen.queryByLabelText("Standalone issue columns control")
    ).not.toBeInTheDocument()
  })

  it("renders one table-bounded selection overlay and no footer duplicate", async () => {
    const user = userEvent.setup()
    render(<WorkspaceProbe callbacks={createCallbacks()} />)

    await user.click(screen.getByRole("checkbox", { name: "Select issue 1" }))
    const overlay = screen.getByTestId("data-table-selection-anchor")
    const bar = screen.getByTestId("data-table-selection-bar")
    const footer = screen.getByLabelText("Issue table footer")
    expect(overlay).toHaveClass("sticky", "h-fit", "self-end", "justify-center")
    expect(overlay).toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    )
    expect(bar).toContainElement(
      screen.getByRole("status", { name: "1 selected" })
    )
    expect(screen.getAllByText("1 selected")).toHaveLength(1)
    expect(within(footer).queryByText("1 selected")).not.toBeInTheDocument()
    expect(footer).not.toHaveClass("sticky")

    await user.click(within(bar).getByRole("button", { name: "Clear" }))
    expect(
      screen.queryByTestId("data-table-selection-bar")
    ).not.toBeInTheDocument()
  })
})
