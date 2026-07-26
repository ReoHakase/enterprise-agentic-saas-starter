import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { IssueActivity } from "../../schema"
import { IssueActivityItem } from "../issue-activity/issue-activity"
import { IssueComment } from "../issue-comment/issue-comment"
import type { IssueCommentUiItem, IssueUiItem } from "../types/types"

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
  revision: 1,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}

const comment: IssueCommentUiItem = {
  id: "comment-1",
  authorId: "user-1",
  author: { id: "user-1", name: "Alex", profileImage: null },
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
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-11T01:00:00.000Z",
}

const fileAddedActivity: IssueActivity = {
  type: "activity",
  id: "activity-file-added",
  kind: "file_added",
  field: null,
  fromValue: null,
  toValue: "roadmap_final.txt",
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-11T02:00:00.000Z",
}

const fileDeletedActivity: IssueActivity = {
  type: "activity",
  id: "activity-file-deleted",
  kind: "file_deleted",
  field: null,
  fromValue: "old-notes.txt",
  toValue: null,
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-11T03:00:00.000Z",
}

const assignees = [
  {
    id: "user-2",
    name: "Jordan",
    email: "jordan@example.test",
    profileImage: null,
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

  it("renders file additions and deletions with the actor profile image and filename", () => {
    render(
      <ol>
        <IssueActivityItem activity={fileAddedActivity} assignees={assignees} />
        <IssueActivityItem
          activity={fileDeletedActivity}
          assignees={assignees}
        />
      </ol>
    )

    const descriptions = screen.getAllByTestId("issue-activity-description")
    expect(descriptions[0]).toHaveTextContent("Alex attached roadmap_final.txt")
    expect(descriptions[1]).toHaveTextContent("Alex deleted old-notes.txt")
    expect(descriptions[0]).not.toHaveTextContent("roadmap final.txt")

    const actorMarkers = screen.getAllByTestId("issue-activity-actor-marker")
    expect(actorMarkers).toHaveLength(2)
    expect(actorMarkers[0]).toHaveTextContent("AL")
    expect(actorMarkers[1]).toHaveTextContent("AL")

    const fieldMarkers = screen.getAllByTestId("issue-activity-field-marker")
    expect(fieldMarkers[0]).toHaveClass("bg-blue-50", "dark:bg-blue-950")
    expect(fieldMarkers[1]).toHaveClass("bg-red-50", "dark:bg-red-950")
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
