import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { IssuesWorkspace, type IssueUiItem } from "./issues-workspace"

const billingIssue: IssueUiItem = {
  id: "issue-billing",
  number: 12,
  title: "Fix billing webhook retries",
  description: "Retry failed invoice events with an idempotency key.",
  status: "open",
  priority: "urgent",
  assigneeId: null,
  creatorId: "user-1",
  labels: ["billing", "bug"],
  dueDate: "2026-07-20T00:00:00.000Z",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}

const issues: IssueUiItem[] = [
  billingIssue,
  {
    id: "issue-access",
    number: 11,
    title: "Document role permissions",
    description: "",
    status: "closed",
    priority: "medium",
    assigneeId: "user-2",
    creatorId: "user-1",
    labels: ["docs"],
    dueDate: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
]

const renderWorkspace = (
  overrides: Partial<React.ComponentProps<typeof IssuesWorkspace>> = {}
) => {
  const props = {
    issues,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onCreateComment: vi.fn(),
    ...overrides,
  }
  render(<IssuesWorkspace {...props} />)
  return props
}

describe("IssuesWorkspace", () => {
  it("searches the populated issue table", async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.type(
      screen.getByRole("searchbox", { name: "Search issues" }),
      "billing"
    )

    expect(screen.getByText("Fix billing webhook retries")).toBeInTheDocument()
    expect(
      screen.queryByText("Document role permissions")
    ).not.toBeInTheDocument()
  })

  it("creates an issue from the dialog", async () => {
    const user = userEvent.setup()
    const { onCreate } = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "New issue" }))
    await user.type(screen.getByLabelText("Title"), "Prepare launch checklist")
    await user.click(screen.getByRole("button", { name: "Create issue" }))

    expect(onCreate).toHaveBeenCalledWith("Prepare launch checklist")
  })

  it("edits issue details and posts a comment", async () => {
    const user = userEvent.setup()
    const { onUpdate, onCreateComment } = renderWorkspace()

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    const title = screen.getByLabelText("Title")
    await user.clear(title)
    await user.type(title, "Fix payment retries")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(onUpdate).toHaveBeenCalledWith(
      billingIssue,
      expect.objectContaining({ title: "Fix payment retries" })
    )

    await user.type(screen.getByLabelText("Add comment"), "Verified in staging")
    await user.click(screen.getByRole("button", { name: "Comment" }))
    expect(onCreateComment).toHaveBeenCalledWith(
      billingIssue,
      "Verified in staging"
    )
  })

  it("requires destructive confirmation before deleting", async () => {
    const user = userEvent.setup()
    const { onDelete } = renderWorkspace()

    await user.click(
      screen.getByRole("button", {
        name: `Actions for ${billingIssue.title}`,
      })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete issue" })
    )
    await user.click(screen.getByRole("button", { name: "Delete issue" }))

    expect(onDelete).toHaveBeenCalledWith(billingIssue)
  })

  it("renders empty and error states with recovery", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(
      <IssuesWorkspace
        issues={[]}
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText("No matching issues")).toBeInTheDocument()

    rerender(
      <IssuesWorkspace
        issues={[]}
        error="Tenant request failed"
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Tenant request failed")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
