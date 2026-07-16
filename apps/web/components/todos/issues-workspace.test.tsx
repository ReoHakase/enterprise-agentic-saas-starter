import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/lib/console-api"

import {
  IssuesWorkspace,
  type IssueCommentUiItem,
  type IssueUiItem,
} from "./issues-workspace"

type IssuesWorkspaceProps = React.ComponentProps<typeof IssuesWorkspace>
type RequiredCallbacks = Required<
  Pick<
    IssuesWorkspaceProps,
    | "onCreate"
    | "onToggle"
    | "onDelete"
    | "onUpdate"
    | "onCreateComment"
    | "onUpdateComment"
    | "onDeleteComment"
  >
>

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
  dueDate: "2026-07-20",
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
const emptyIssues: IssueUiItem[] = []

const discussionComment: IssueCommentUiItem = {
  id: "comment-1",
  authorId: "user-2",
  author: {
    id: "user-2",
    name: "Jordan Lee",
    image: null,
  },
  body: "Retry policy was verified in staging.",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}

const renderWorkspace = (overrides: Partial<IssuesWorkspaceProps> = {}) => {
  const props = {
    issues,
    onCreate: vi.fn<RequiredCallbacks["onCreate"]>(),
    onToggle: vi.fn<RequiredCallbacks["onToggle"]>(),
    onDelete: vi.fn<RequiredCallbacks["onDelete"]>(),
    onUpdate: vi.fn<RequiredCallbacks["onUpdate"]>(),
    onCreateComment: vi.fn<RequiredCallbacks["onCreateComment"]>(),
    onUpdateComment: vi.fn<RequiredCallbacks["onUpdateComment"]>(),
    onDeleteComment: vi.fn<RequiredCallbacks["onDeleteComment"]>(),
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

  it("validates issue titles and comments before calling actions", async () => {
    const user = userEvent.setup()
    const { onCreate, onCreateComment } = renderWorkspace()

    await user.click(screen.getByRole("button", { name: "New issue" }))
    await user.type(screen.getByLabelText("Title"), "   ")
    await user.click(screen.getByRole("button", { name: "Create issue" }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText("Enter an issue title.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    await user.type(screen.getByLabelText("Add comment"), "   ")
    await user.click(screen.getByRole("button", { name: "Comment" }))

    expect(onCreateComment).not.toHaveBeenCalled()
    expect(screen.getByText("Enter a comment.")).toBeInTheDocument()
  })

  it("edits issue details and posts a comment", async () => {
    const user = userEvent.setup()
    const { onUpdate, onCreateComment } = renderWorkspace()

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-07-20")
    const title = screen.getByLabelText("Title")
    await user.clear(title)
    await user.type(title, "Fix payment retries")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(onUpdate).toHaveBeenCalledWith(
      billingIssue,
      expect.objectContaining({
        title: "Fix payment retries",
        dueDate: "2026-07-20",
      })
    )

    await user.type(screen.getByLabelText("Add comment"), "Verified in staging")
    await user.click(screen.getByRole("button", { name: "Comment" }))
    expect(onCreateComment).toHaveBeenCalledWith(
      billingIssue,
      "Verified in staging"
    )
  })

  it("keeps the detail form open with its values when saving fails", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn<RequiredCallbacks["onUpdate"]>(async () => {
      throw new Error("Update failed")
    })
    renderWorkspace({ onUpdate })

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    const title = screen.getByLabelText("Title")
    await user.clear(title)
    await user.type(title, "Keep this draft")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(title).toHaveValue("Keep this draft")
    expect(
      screen.getByRole("dialog", { name: billingIssue.title })
    ).toBeInTheDocument()
  })

  it("keeps a new comment draft and shows its server field error", async () => {
    const user = userEvent.setup()
    const onCreateComment = vi.fn<RequiredCallbacks["onCreateComment"]>(
      async () => {
        throw new ConsoleApiError({
          code: "VALIDATION_ERROR",
          fieldErrors: { body: ["Comment is not allowed."] },
          message: "Comment rejected",
          status: 422,
        })
      }
    )
    renderWorkspace({ onCreateComment })

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    const comment = screen.getByLabelText("Add comment")
    await user.type(comment, "Keep this comment draft")
    await user.click(screen.getByRole("button", { name: "Comment" }))

    expect(
      await screen.findByText("Comment is not allowed.")
    ).toBeInTheDocument()
    expect(comment).toHaveValue("Keep this comment draft")
  })

  it("keeps an edited comment draft and shows its server field error", async () => {
    const user = userEvent.setup()
    const onUpdateComment = vi.fn<RequiredCallbacks["onUpdateComment"]>(
      async () => {
        throw new ConsoleApiError({
          code: "VALIDATION_ERROR",
          fieldErrors: { body: ["Edit is not allowed."] },
          message: "Comment edit rejected",
          status: 422,
        })
      }
    )
    renderWorkspace({ comments: [discussionComment], onUpdateComment })

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    await user.click(screen.getByRole("button", { name: "Edit" }))
    const editor = screen.getByRole("textbox", { name: "Edit comment" })
    await user.clear(editor)
    await user.type(editor, "Keep this edit draft")
    await user.click(screen.getByRole("button", { name: "Save comment" }))

    expect(await screen.findByText("Edit is not allowed.")).toBeInTheDocument()
    expect(editor).toHaveValue("Keep this edit draft")
  })

  it("updates and deletes an existing comment from the issue detail", async () => {
    const user = userEvent.setup()
    const { onUpdateComment, onDeleteComment } = renderWorkspace({
      comments: [discussionComment],
    })

    await user.click(screen.getByRole("button", { name: billingIssue.title }))
    expect(screen.getByText(discussionComment.body)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Edit" }))
    const editor = screen.getByRole("textbox", { name: "Edit comment" })
    await user.clear(editor)
    await user.type(editor, "Retry policy is documented.")
    await user.click(screen.getByRole("button", { name: "Save comment" }))
    expect(onUpdateComment).toHaveBeenCalledWith(
      billingIssue,
      discussionComment.id,
      "Retry policy is documented."
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Delete comment" }))
    expect(onDeleteComment).toHaveBeenCalledWith(
      billingIssue,
      discussionComment.id
    )
  })

  it("closes and reopens an issue from its row actions", async () => {
    const user = userEvent.setup()
    const { onToggle } = renderWorkspace()

    await user.click(
      screen.getByRole("button", {
        name: `Actions for ${billingIssue.title}`,
      })
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "Close issue" })
    )

    expect(onToggle).toHaveBeenCalledWith(billingIssue)
  })

  it("keeps the priority trigger mounted and focused across pending reorder", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn<RequiredCallbacks["onCreate"]>()
    const onToggle = vi.fn<RequiredCallbacks["onToggle"]>()
    const onDelete = vi.fn<RequiredCallbacks["onDelete"]>()
    const onUpdate = vi.fn<RequiredCallbacks["onUpdate"]>()
    const onSelectIssue =
      vi.fn<NonNullable<IssuesWorkspaceProps["onSelectIssue"]>>()
    const accessIssue = issues[1]
    if (!accessIssue) throw new Error("access issue fixture is required")
    const reorderedIssues = [
      billingIssue,
      { ...accessIssue, updatedAt: "2026-07-14T00:00:00.000Z" },
    ]
    const renderTable = (issueValues: IssueUiItem[], busyIssueId?: string) => (
      <IssuesWorkspace
        issues={issueValues}
        busyIssueId={busyIssueId}
        onCreate={onCreate}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={onUpdate}
        onSelectIssue={onSelectIssue}
      />
    )
    const view = render(renderTable(issues))
    const priority = screen.getByRole("combobox", {
      name: `Priority for ${accessIssue.title}`,
    })

    let reachedPriority = false
    for (let index = 0; index < 30; index += 1) {
      try {
        expect(priority).toHaveFocus()
        reachedPriority = true
        break
      } catch {
        // oxlint-disable-next-line no-await-in-loop -- focus order is sequential.
        await user.tab()
      }
    }
    expect(reachedPriority).toBe(true)
    expect(priority).toHaveFocus()

    view.rerender(renderTable(reorderedIssues, accessIssue.id))
    const busyPriority = screen.getByRole("combobox", {
      name: `Priority for ${accessIssue.title}`,
    })
    expect(busyPriority).toBe(priority)
    expect(busyPriority).toHaveFocus()
    expect(busyPriority).toHaveAttribute("aria-busy", "true")

    view.rerender(renderTable(reorderedIssues))
    expect(
      screen.getByRole("combobox", {
        name: `Priority for ${accessIssue.title}`,
      })
    ).toBe(priority)
    expect(priority).toHaveFocus()
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
    const onCreate = vi.fn<RequiredCallbacks["onCreate"]>()
    const onToggle = vi.fn<RequiredCallbacks["onToggle"]>()
    const onDelete = vi.fn<RequiredCallbacks["onDelete"]>()
    const onRetry = vi.fn<NonNullable<IssuesWorkspaceProps["onRetry"]>>()
    const { rerender } = render(
      <IssuesWorkspace
        issues={emptyIssues}
        onCreate={onCreate}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText("No matching issues")).toBeInTheDocument()

    rerender(
      <IssuesWorkspace
        issues={emptyIssues}
        error="Tenant request failed"
        onCreate={onCreate}
        onToggle={onToggle}
        onDelete={onDelete}
        onRetry={onRetry}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Tenant request failed")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("renders the compact mobile status summary", () => {
    renderWorkspace()

    const summary = screen.getByLabelText("Issue status summary")
    expect(summary).toHaveClass("sm:hidden")
    expect(within(summary).getByText("Open")).toBeInTheDocument()
    expect(within(summary).getByText("In progress")).toBeInTheDocument()
    expect(within(summary).getByText("Closed")).toBeInTheDocument()
    expect(within(summary).getAllByText("1", { selector: "dd" })).toHaveLength(
      2
    )
    expect(
      within(summary).getByText("0", { selector: "dd" })
    ).toBeInTheDocument()
  })
})
