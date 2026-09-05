import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PropsWithChildren } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { issueKeys } from "../../queries"
import type { Issue, IssueTimelinePage } from "../../schema"
import type { IssueAssigneeOption } from "../types"

const mocks = vi.hoisted(() => ({
  getIssueTimeline: vi.fn<() => Promise<IssueTimelinePage>>(),
  historyBack: vi.fn<() => void>(),
  routerNavigate: vi.fn<(input: { href: string }) => void>(),
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    history: { back: mocks.historyBack },
    navigate: mocks.routerNavigate,
  }),
}))

vi.mock("../../api", () => ({
  createIssueComment: vi.fn<() => void>(),
  deleteIssueComment: vi.fn<() => void>(),
  getIssueTimeline: mocks.getIssueTimeline,
  updateIssue: vi.fn<() => void>(),
  updateIssueComment: vi.fn<() => void>(),
}))

vi.mock("../issue-detail-page/issue-detail-page", () => ({
  IssueDetailPage: ({
    timeline,
    onFilesChanged,
    onRequestClose,
  }: {
    timeline: IssueTimelinePage["items"]
    onFilesChanged?: () => Promise<void> | void
    onRequestClose: () => void
  }) => (
    <div>
      <span>{timeline.map((item) => item.id).join(",")}</span>
      <button type="button" onClick={onFilesChanged}>
        Notify file changes
      </button>
      <button type="button" onClick={onRequestClose}>
        Back to issues
      </button>
    </div>
  ),
}))

import { IssueDetailController } from "./issue-detail-controller"

const issue: Issue = {
  id: "issue-1",
  organizationId: "org-1",
  number: 1,
  title: "Preview attachments",
  description: "",
  status: "open",
  priority: "medium",
  assigneeId: null,
  creatorId: "user-1",
  labels: [],
  dueDate: null,
  revision: 1,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
}

const activity = (id: string): IssueTimelinePage["items"][number] => ({
  type: "activity",
  id,
  kind: "created",
  field: null,
  fromValue: null,
  toValue: null,
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-20T00:00:00.000Z",
})

const initialTimeline: IssueTimelinePage = {
  items: [activity("activity-initial")],
  nextCursor: null,
}
const noAssignees: IssueAssigneeOption[] = []
const navigationEntry = (name: string): PerformanceEntry => ({
  duration: 0,
  entryType: "navigation",
  name,
  startTime: 0,
  toJSON: () => ({}),
})

describe("Issue詳細controller", () => {
  beforeEach(() => {
    mocks.getIssueTimeline.mockReset()
    mocks.historyBack.mockReset()
    mocks.routerNavigate.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it("ファイル状態の確定後にIssue timelineを再取得する", async () => {
    const user = userEvent.setup()
    const navigationEntries = vi
      .spyOn(globalThis.performance, "getEntriesByType")
      .mockReturnValue([
        navigationEntry("http://localhost/organization/acme/issues"),
      ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
    mocks.getIssueTimeline.mockResolvedValue({
      items: [activity("activity-refreshed")],
      nextCursor: null,
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    render(
      <IssueDetailController
        initialIssue={issue}
        initialTimeline={initialTimeline}
        assignees={noAssignees}
        organizationId="org-1"
        canonicalHref="/organization/acme/issues/1"
      />,
      { wrapper: Wrapper }
    )

    await user.click(
      screen.getByRole("button", { name: "Notify file changes" })
    )

    await waitFor(() =>
      expect(mocks.getIssueTimeline).toHaveBeenCalledWith(expect.anything(), {
        id: "issue-1",
        organizationId: "org-1",
        limit: 50,
      })
    )
    expect(await screen.findByText("activity-refreshed")).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: issueKeys.timeline("org-1", "issue-1"),
    })

    await user.click(screen.getByRole("button", { name: "Back to issues" }))
    expect(mocks.historyBack).toHaveBeenCalledOnce()

    navigationEntries.mockReturnValue([
      navigationEntry("http://localhost/organization/acme/issues/1"),
    ])
    await user.click(screen.getByRole("button", { name: "Back to issues" }))
    expect(mocks.routerNavigate).toHaveBeenCalledWith({
      href: "/organization/acme/issues",
    })
  })
})
