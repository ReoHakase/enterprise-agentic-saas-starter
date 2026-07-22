import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { issueKeys } from "@/features/issues/queries"
import type { Issue, IssueTimelinePage } from "@/features/issues/schema"

import type { IssueAssigneeOption } from "./types"

const mocks = vi.hoisted(() => ({
  getIssueTimeline: vi.fn<() => Promise<IssueTimelinePage>>(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
  }),
}))

vi.mock("@/features/issues/api", () => ({
  createIssueComment: vi.fn<() => void>(),
  deleteIssueComment: vi.fn<() => void>(),
  getIssueTimeline: mocks.getIssueTimeline,
  updateIssue: vi.fn<() => void>(),
  updateIssueComment: vi.fn<() => void>(),
}))

vi.mock("./issue-detail-dialog", () => ({
  IssueDetailDialog: ({
    timeline,
    onFilesChanged,
  }: {
    timeline: IssueTimelinePage["items"]
    onFilesChanged?: () => Promise<void> | void
  }) => (
    <div>
      <span>{timeline.map((item) => item.id).join(",")}</span>
      <button type="button" onClick={onFilesChanged}>
        Notify file changes
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

describe("issue detail controller", () => {
  beforeEach(() => {
    mocks.getIssueTimeline.mockReset()
  })

  it("refreshes the issue timeline after file state converges", async () => {
    const user = userEvent.setup()
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
        mode="page"
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
  })
})
