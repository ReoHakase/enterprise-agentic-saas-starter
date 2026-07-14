"use client"

import { useCallback, useState } from "react"

import { IssueDetailDialog } from "./issue-detail-dialog"
import { emptyAssigneeOptions } from "./issue-utils"
import { IssuesTable } from "./issues-table"
import type { IssuesWorkspaceProps, IssueUiItem } from "./types"

export const IssuesWorkspace = ({
  issues,
  pending,
  busyIssueId,
  error,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  assignees = emptyAssigneeOptions,
  selectedIssueId: controlledSelectedIssueId,
  onSelectIssue,
  comments,
  commentsPending,
  commentsError,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onRetry,
}: IssuesWorkspaceProps) => {
  const [localSelectedIssueId, setLocalSelectedIssueId] = useState<string>()
  const selectedIssueId =
    controlledSelectedIssueId === undefined
      ? localSelectedIssueId
      : (controlledSelectedIssueId ?? undefined)
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId)
  const selectIssue = useCallback(
    (issue?: IssueUiItem) => {
      if (controlledSelectedIssueId === undefined) {
        setLocalSelectedIssueId(issue?.id)
      }
      onSelectIssue?.(issue)
    },
    [controlledSelectedIssueId, onSelectIssue]
  )
  const closeDetail = useCallback(
    (open: boolean) => {
      if (!open) selectIssue()
    },
    [selectIssue]
  )

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Issues">
      <IssuesTable
        issues={issues}
        pending={pending}
        busyIssueId={busyIssueId}
        error={error}
        assignees={assignees}
        onCreate={onCreate}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={onUpdate}
        onSelect={selectIssue}
        onRetry={onRetry}
      />

      {selectedIssue ? (
        <IssueDetailDialog
          key={`${selectedIssue.id}:${selectedIssue.updatedAt}`}
          issue={selectedIssue}
          comments={comments}
          assignees={assignees}
          commentsPending={commentsPending}
          commentsError={commentsError}
          pending={pending || busyIssueId === selectedIssue.id}
          onUpdate={onUpdate}
          onCreateComment={onCreateComment}
          onUpdateComment={onUpdateComment}
          onDeleteComment={onDeleteComment}
          onOpenChange={closeDetail}
        />
      ) : null}
    </section>
  )
}
