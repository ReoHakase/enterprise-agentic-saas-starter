import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { IssueActivity } from "../../schema"
import { IssueActivityItem } from "../issue-activity/issue-activity"
import { IssueComment } from "../issue-comment/issue-comment"
import type { IssueCommentUiItem, IssueUiItem } from "../types"

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

const createdActivity: IssueActivity = {
  type: "activity",
  id: "activity-created",
  kind: "created",
  field: null,
  fromValue: null,
  toValue: null,
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-11T00:00:00.000Z",
}

const statusActivity: IssueActivity = {
  type: "activity",
  id: "activity-status",
  kind: "field_changed",
  field: "status",
  fromValue: "open",
  toValue: "in_progress",
  actor: { id: "user-1", name: "Alex", profileImage: null },
  createdAt: "2026-07-11T00:30:00.000Z",
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

describe("Issue timelineの契約", () => {
  it.each([
    {
      activity: createdActivity,
      caseLabel: "Issue作成",
      expected: /Alex.*created this issue/u,
    },
    {
      activity: statusActivity,
      caseLabel: "status変更",
      expected: /Alex.*changed status from Open to In progress/u,
    },
  ])("$caseLabelを公開文言で表示する", ({ activity, expected }) => {
    render(
      <ol>
        <IssueActivityItem activity={activity} assignees={assignees} />
      </ol>
    )

    expect(screen.getByRole("listitem")).toHaveTextContent(expected)
  })

  it("担当者の変更を人間が判読できるタイムライン項目としてレンダリングする", () => {
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
    expect(screen.getByRole("listitem")).toHaveTextContent(
      /Alex changed assignee from Unassigned to .*Jordan/
    )
    expect(screen.getByRole("time")).toHaveAttribute(
      "datetime",
      assigneeActivity.createdAt
    )
  })

  it("実行者のプロフィール画像とファイル名を添えてファイル追加・削除を表示する", () => {
    render(
      <ol>
        <IssueActivityItem activity={fileAddedActivity} assignees={assignees} />
        <IssueActivityItem
          activity={fileDeletedActivity}
          assignees={assignees}
        />
      </ol>
    )

    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveTextContent("Alex attached roadmap_final.txt")
    expect(items[1]).toHaveTextContent("Alex deleted old-notes.txt")
    expect(items[0]).not.toHaveTextContent("roadmap final.txt")
  })

  it("編集済みコメントの公開情報を表示する", () => {
    render(
      <ol>
        <IssueComment
          issue={issue}
          comment={comment}
          onUpdateComment={vi.fn<
            (issue: IssueUiItem, commentId: string, body: string) => void
          >()}
          onDirtyChange={vi.fn<(dirty: boolean) => void>()}
        />
      </ol>
    )

    expect(screen.getByText("Edited")).toBeInTheDocument()
    expect(screen.getByText(/edited at/)).toBeInTheDocument()
    expect(
      screen
        .getAllByRole("time")
        .some((time) => time.getAttribute("datetime") === comment.updatedAt)
    ).toBe(true)
  })

  it("コメント編集をキャンセルするとダーティ状態をリセットする", async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn<(dirty: boolean) => void>()
    const onUpdateComment =
      vi.fn<(issue: IssueUiItem, commentId: string, body: string) => void>()
    render(
      <ol>
        <IssueComment
          issue={issue}
          comment={comment}
          onUpdateComment={onUpdateComment}
          onDirtyChange={onDirtyChange}
        />
      </ol>
    )

    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("button", { name: "Save comment" })).toBeDisabled()

    await user.type(screen.getByLabelText("Edit comment"), " Ready")
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByRole("button", { name: "Save comment" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it("timeline dataが更新されても未保存のコメントdraftを保持する", async () => {
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
