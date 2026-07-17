import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { IssueActivity } from "@/features/issues/schema"

import { IssueActivityItem } from "./issue-activity"
import { IssueComment } from "./issue-comment"
import type { IssueCommentUiItem, IssueUiItem } from "./types"

const issue: IssueUiItem = {
  id: "issue-1",
  number: 1,
  title: "Improve the timeline",
  description: "",
  status: "open",
  priority: "medium",
  assigneeId: "user-2",
  creatorId: "user-1",
  labels: [],
  dueDate: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}

const comment: IssueCommentUiItem = {
  id: "comment-1",
  authorId: "user-1",
  author: { id: "user-1", name: "Alex", image: null },
  body: "Verified in staging.",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}

const assigneeActivity: IssueActivity = {
  type: "activity",
  id: "activity-1",
  kind: "field_changed",
  field: "assignee",
  fromValue: null,
  toValue: "user-2",
  actor: { id: "user-1", name: "Alex", image: null },
  createdAt: "2026-07-11T01:00:00.000Z",
}

const assignees = [
  {
    id: "user-2",
    name: "Jordan",
    email: "jordan@example.test",
    image: null,
  },
]

describe("issue timeline", () => {
  it("renders an assignee change as a human-readable timeline item", () => {
    render(
      <ol>
        <IssueActivityItem activity={assigneeActivity} assignees={assignees} />
      </ol>
    )

    expect(screen.getByRole("listitem")).toBeInTheDocument()
    expect(screen.getByText("Alex")).toBeInTheDocument()
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
    expect(screen.getByText("Jordan")).toBeInTheDocument()
    expect(screen.queryByText("user-2")).not.toBeInTheDocument()
    const actorMarker = screen.getByTestId("issue-activity-actor-marker")
    expect(actorMarker).toHaveTextContent("AL")
    expect(actorMarker).toHaveClass(
      "bg-(--issue-timeline-surface,var(--color-background))",
      "ring-(--issue-timeline-surface,var(--color-background))"
    )
    const fieldMarker = screen.getByTestId("issue-activity-field-marker")
    expect(fieldMarker).toHaveClass(
      "bg-cyan-50",
      "dark:bg-cyan-950",
      "ring-(--issue-timeline-surface,var(--color-background))",
      "[&>svg]:size-3.5",
      "[&>svg]:stroke-[1.75]"
    )
    const description = screen.getByTestId("issue-activity-description")
    expect(description).toHaveTextContent(
      /Alex changed assignee from Unassigned to .*Jordan/
    )
    expect(description).not.toHaveClass("inline-flex")
    expect(screen.getByRole("time")).toHaveAttribute(
      "datetime",
      assigneeActivity.createdAt
    )
  })

  it("reports an edited comment as dirty and resets the state on cancel", async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn<(dirty: boolean) => void>()
    const onUpdateComment =
      vi.fn<(issue: IssueUiItem, commentId: string, body: string) => void>()
    const view = render(
      <ol>
        <IssueComment
          issue={issue}
          comment={comment}
          onUpdateComment={onUpdateComment}
          onDirtyChange={onDirtyChange}
        />
      </ol>
    )

    expect(screen.getByText("Edited")).toBeInTheDocument()
    expect(screen.getByText(/edited at/)).toBeInTheDocument()
    const timelineItem = screen.getByRole("listitem")
    expect(timelineItem).toHaveClass("isolate", "before:z-0")
    expect(screen.getByTestId("issue-comment-actor-marker")).toHaveClass("z-20")
    expect(screen.getByTestId("issue-comment-actor-marker")).toHaveClass(
      "bg-(--issue-timeline-surface,var(--color-background))",
      "ring-(--issue-timeline-surface,var(--color-background))"
    )
    expect(screen.getByTestId("issue-comment-card")).toHaveClass("z-10")
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("button", { name: "Save comment" })).toBeDisabled()

    await user.type(screen.getByLabelText("Edit comment"), " Ready")
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByRole("button", { name: "Save comment" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))

    view.unmount()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it("preserves a dirty comment draft when refreshed timeline data changes", async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn<(dirty: boolean) => void>()
    const onUpdateComment =
      vi.fn<(issue: IssueUiItem, commentId: string, body: string) => void>()
    const renderComment = (nextComment: IssueCommentUiItem) => (
      <ol>
        <IssueComment
          issue={issue}
          comment={nextComment}
          onUpdateComment={onUpdateComment}
          onDirtyChange={onDirtyChange}
        />
      </ol>
    )
    const view = render(renderComment(comment))

    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.type(screen.getByLabelText("Edit comment"), " Local draft")
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    view.rerender(
      renderComment({
        ...comment,
        body: "Concurrent server edit",
        updatedAt: "2026-07-14T00:00:00.000Z",
      })
    )

    expect(screen.getByLabelText("Edit comment")).toHaveValue(
      "Verified in staging. Local draft"
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})
