import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { IssueTimelineItem } from "@/features/issues/schema"

import { IssueDetailDialog } from "./issue-detail-dialog"
import { IssueModalRouteShell } from "./issue-modal-route-shell"
import { IssuesWorkspace } from "./issues-workspace"
import type { IssueUiItem } from "./types"

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
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
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
  },
  {
    ...billingIssue,
    id: "issue-progress",
    number: 10,
    title: "Verify release candidate",
    status: "in_progress",
    priority: "high",
    labels: ["release"],
  },
]
const noIssues: IssueUiItem[] = []
const assignees = [
  {
    id: "user-2",
    name: "Jordan",
    email: "jordan@example.test",
    profileImage: null,
  },
]

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn<() => void>() }),
}))

vi.mock("@/features/files/components/file-attachments", () => ({
  FileAttachments: () => (
    <section role="region" aria-label="Attachments">
      Attachments
    </section>
  ),
}))

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

const renderWorkspace = (issueValues = issues) => {
  const callbacks = {
    onCreate: vi.fn<(title: string) => Promise<void>>(),
    onToggle: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
    onDelete: vi.fn<(issue: IssueUiItem) => Promise<void>>(),
    onUpdate: vi.fn<(issue: IssueUiItem, update: object) => Promise<void>>(),
    assignees,
    getIssueHref: (issue: IssueUiItem) =>
      `/organization/acme/issues/${issue.number.toString()}`,
    onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
  }
  render(<IssuesWorkspace issues={issueValues} {...callbacks} />)
  return callbacks
}

const renderDetail = (mode: "modal" | "page" = "modal") => {
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
  const detail = (
    <IssueDetailDialog
      issue={billingIssue}
      timeline={timeline}
      nextCursor="2026-07-09T00:00:00.000Z"
      canonicalHref="/organization/acme/issues/12"
      organizationId="org-1"
      mode={mode}
      assignees={assignees}
      {...callbacks}
    />
  )
  render(
    mode === "modal" ? (
      <IssueModalRouteShell>{detail}</IssueModalRouteShell>
    ) : (
      detail
    )
  )
  return callbacks
}

describe("organization issues", () => {
  it("renders the full-width table with the requested columns and filters", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    expect(headers.slice(0, 7)).toEqual([
      "Number",
      "Name",
      "Status",
      "Priority",
      "Assignee",
      "Due date and time",
      "Updated",
    ])
    expect(screen.getByText("#12")).toBeInTheDocument()
    expect(screen.getByTestId("status-open")).toHaveClass("bg-white")
    expect(screen.getByTestId("status-in-progress")).toHaveClass(
      "bg-violet-200"
    )
    expect(screen.getByTestId("status-closed")).toHaveClass("bg-purple-600")
    expect(screen.getByTestId("priority-urgent")).toHaveClass("text-red-800")

    await user.type(
      screen.getByRole("searchbox", { name: "Search issues" }),
      "billing"
    )
    expect(screen.getByText(billingIssue.title)).toBeInTheDocument()
    expect(screen.queryByText("Document role permissions")).toBeNull()
  })

  it("creates, opens, closes, and deletes from the table", async () => {
    const user = userEvent.setup()
    const callbacks = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "New issue" }))
    await user.type(screen.getByLabelText("Title"), "Prepare launch")
    await user.click(screen.getByRole("button", { name: "Create issue" }))
    expect(callbacks.onCreate).toHaveBeenCalledWith("Prepare launch")

    expect(
      screen.getByRole("link", { name: billingIssue.title })
    ).toHaveAttribute("href", "/organization/acme/issues/12")
    const fullPageLink = screen.getByRole("link", {
      name: `Open ${billingIssue.title} as full page`,
    })
    expect(fullPageLink).toHaveAttribute("href", "/organization/acme/issues/12")
    expect(fullPageLink).toHaveTextContent("Full page")

    await user.click(
      screen.getByRole("button", { name: `Actions for ${billingIssue.title}` })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "View details" })
    )
    expect(callbacks.onSelectIssue).toHaveBeenCalledWith(billingIssue)

    await user.click(
      screen.getByRole("button", { name: `Actions for ${billingIssue.title}` })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete issue" })
    )
    await user.click(screen.getByRole("button", { name: "Delete issue" }))
    expect(callbacks.onDelete).toHaveBeenCalledWith(billingIssue)
  })

  it("shows empty metrics and recovery state", async () => {
    const user = userEvent.setup()
    const callbacks = {
      onCreate: vi.fn<(title: string) => void>(),
      onToggle: vi.fn<(issue: IssueUiItem) => void>(),
      onDelete: vi.fn<(issue: IssueUiItem) => void>(),
      getIssueHref: (issue: IssueUiItem) =>
        `/organization/acme/issues/${issue.number.toString()}`,
      onSelectIssue: vi.fn<(issue: IssueUiItem) => void>(),
      onRetry: vi.fn<() => void>(),
    }
    const view = render(<IssuesWorkspace issues={noIssues} {...callbacks} />)
    expect(screen.getByText("No matching issues")).toBeInTheDocument()
    expect(
      within(screen.getByLabelText("Issue status summary")).getAllByText("0")
    ).toHaveLength(3)

    view.rerender(
      <IssuesWorkspace
        issues={noIssues}
        error="Request failed"
        {...callbacks}
      />
    )
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(callbacks.onRetry).toHaveBeenCalledOnce()
  })

  it("edits issue fields and renders activity with comments", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    expect(screen.getByText("created this issue")).toBeInTheDocument()
    expect(screen.getByText(/changed status from/)).toBeInTheDocument()
    expect(screen.getAllByTestId("status-open").length).toBeGreaterThan(0)
    expect(screen.getAllByTestId("status-in-progress").length).toBeGreaterThan(
      0
    )
    expect(screen.getByText(/changed assignee from/)).toBeInTheDocument()
    expect(screen.getAllByText("Jordan").length).toBeGreaterThan(0)
    expect(screen.queryByText("user-2")).not.toBeInTheDocument()
    expect(screen.getAllByText("JO").length).toBeGreaterThan(0)
    expect(screen.getByText("Verified in staging.")).toBeInTheDocument()
    expect(screen.getByText("Edited")).toBeInTheDocument()
    expect(screen.getByText(/edited at/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Load older" }))
    expect(callbacks.onLoadOlder).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Edit issue title" }))
    const title = screen.getByLabelText("Issue title")
    const saveTitle = screen.getByRole("button", { name: "Save title" })
    expect(screen.getByRole("form", { name: "Title editor" })).toHaveClass(
      "order-2",
      "w-full",
      "sm:order-1",
      "sm:w-auto",
      "sm:flex-1"
    )
    expect(screen.getByRole("button", { name: "Open full page" })).toHaveClass(
      "order-1",
      "sm:order-2"
    )
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

    await user.click(screen.getByRole("combobox", { name: "Issue status" }))
    await user.click(screen.getByRole("option", { name: "In progress" }))
    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      status: "in_progress",
    })

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
    await user.click(screen.getByRole("combobox", { name: "Due hour" }))
    await user.click(screen.getByRole("option", { name: nextDueHour }))
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

    await user.type(screen.getByLabelText("Add comment"), "Ready to ship")
    await user.click(screen.getByRole("button", { name: "Comment" }))
    expect(callbacks.onCreateComment).toHaveBeenCalledWith(
      billingIssue,
      "Ready to ship"
    )
  })

  it("composes the responsive regions and groups timestamps with description", () => {
    renderDetail()

    expect(screen.getByTestId("issue-detail")).toHaveClass(
      "[--issue-timeline-surface:var(--popover)]"
    )
    const metadata = screen.getByRole("complementary", {
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
    expect(metadata).toBeInTheDocument()
    expect(description).toBeInTheDocument()
    expect(attachments).toBeInTheDocument()
    expect(discussion).toBeInTheDocument()
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
    expect(metadata).toHaveClass(
      "lg:sticky",
      "lg:top-6",
      "lg:col-start-2",
      "lg:row-start-1"
    )
    expect(primaryColumn).toHaveClass("lg:col-start-1", "lg:row-start-1")
    expect(
      screen.getByRole("heading", { name: billingIssue.title })
    ).toBeInTheDocument()
    expect(screen.getByText("#12")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "Open full page",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Open full page" })
    ).toHaveTextContent("Full page")
    expect(
      screen.getByRole("button", { name: "Edit issue title" })
    ).toBeInTheDocument()
    expect(within(description).getByText(/created at/)).toBeInTheDocument()
    expect(within(description).getByText(/updated at/)).toBeInTheDocument()
    expect(within(description).queryByText("Former member")).toBeNull()
  })

  it("settles a failed immediate field update without an unhandled rejection", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()
    callbacks.onUpdate.mockRejectedValueOnce(
      new Error("Injected update failure")
    )

    const status = screen.getByRole("combobox", { name: "Issue status" })
    await user.click(status)
    await user.click(screen.getByRole("option", { name: "In progress" }))

    expect(callbacks.onUpdate).toHaveBeenCalledWith(billingIssue, {
      status: "in_progress",
    })
    await waitFor(() => expect(status).toHaveAttribute("aria-busy", "false"))
  })

  it("confirms before discarding an issue edit or comment draft", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()
    await user.type(screen.getByLabelText("Add comment"), "Keep this draft")
    await user.click(screen.getByRole("button", { name: "Close" }))

    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.getByLabelText("Add comment")).toHaveValue("Keep this draft")
    expect(callbacks.onRequestClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(callbacks.onRequestClose).toHaveBeenCalledOnce()
  })

  it("keeps an edited comment until full-page navigation is confirmed", async () => {
    const user = userEvent.setup()
    renderDetail()
    const commentCard = screen.getByTestId("issue-comment-card")

    await user.click(within(commentCard).getByRole("button", { name: "Edit" }))
    const commentDraft = within(commentCard).getByRole("textbox", {
      name: "Edit comment",
    })
    await user.clear(commentDraft)
    await user.type(commentDraft, "Keep this edited comment")
    await user.click(screen.getByRole("button", { name: "Open full page" }))

    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(commentDraft).toHaveValue("Keep this edited comment")
  })

  it("guards the full-page back action and returns to issues after discard", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail("page")

    expect(screen.getByTestId("issue-detail")).toHaveClass(
      "[--issue-timeline-surface:var(--background)]"
    )
    await user.type(screen.getByLabelText("Add comment"), "Keep this draft")
    await user.click(screen.getByRole("button", { name: "Back to issues" }))
    expect(callbacks.onRequestClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(callbacks.onRequestClose).toHaveBeenCalledOnce()
  })

  it("uses the same discard dialog for browser Back on a full page", async () => {
    const user = userEvent.setup()
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined)
    renderDetail("page")

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
