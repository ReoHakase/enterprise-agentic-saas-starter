"use client"

import type { ReactNode } from "react"

import { issueDetailContent as IssueDetailContent } from "./issue-detail-content"
import {
  emptyPendingFields,
  type IssueDetailDialogProps,
} from "./issue-detail-types"
import { issueDiscardDialog as IssueDiscardDialog } from "./issue-discard-dialog"
import { emptyAssigneeOptions } from "./issue-utils"
import { useIssueAgentForm } from "./use-issue-agent-form"
import { useIssueCommentDirtyState } from "./use-issue-comment-dirty-state"
import { useIssueCommentForm } from "./use-issue-comment-form"
import { useIssueDescriptionForm } from "./use-issue-description-form"
import { useIssueDetailNavigation } from "./use-issue-detail-navigation"
import { useIssueImmediateFields } from "./use-issue-immediate-fields"
import { useIssueTitleForm } from "./use-issue-title-form"

const IssueDetailSurface = ({
  mode,
  children,
}: {
  mode: "modal" | "page"
  children: ReactNode
}) =>
  mode === "modal" ? (
    children
  ) : (
    <article className="mx-auto w-full max-w-6xl">{children}</article>
  )

export const IssueDetailDialog = (props: IssueDetailDialogProps) => {
  const assignees = props.assignees ?? emptyAssigneeOptions
  const labelSuggestions = props.labelSuggestions ?? props.issue.labels
  const title = useIssueTitleForm({
    issue: props.issue,
    pending: props.pending,
    onUpdate: props.onUpdate,
  })
  const description = useIssueDescriptionForm({
    issue: props.issue,
    pending: props.pending,
    onUpdate: props.onUpdate,
  })
  const comment = useIssueCommentForm({
    issue: props.issue,
    pending: props.pending,
    onCreateComment: props.onCreateComment,
  })
  useIssueAgentForm({
    issue: props.issue,
    organizationId: props.organizationId,
    title,
    description,
  })
  const fields = useIssueImmediateFields({
    issue: props.issue,
    pendingFields: props.pendingFields ?? emptyPendingFields,
    onUpdate: props.onUpdate,
  })
  const commentDirty = useIssueCommentDirtyState()
  const navigation = useIssueDetailNavigation({
    canonicalHref: props.canonicalHref,
    issueId: props.issue.id,
    mode: props.mode,
    pending: props.pending,
    immediateFieldSaving: fields.saving,
    dirtyCommentIds: commentDirty.dirtyIds,
    onRequestClose: props.onRequestClose,
    title,
    description,
    comment,
  })

  return (
    <>
      <IssueDetailSurface mode={props.mode}>
        <IssueDetailContent
          props={props}
          assignees={assignees}
          labelSuggestions={labelSuggestions}
          title={title}
          description={description}
          comment={comment}
          navigation={navigation}
          fields={fields}
          getCommentDirtyHandler={commentDirty.getDirtyHandler}
        />
      </IssueDetailSurface>
      <IssueDiscardDialog navigation={navigation} />
    </>
  )
}
