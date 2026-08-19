"use client"

import { issueDetailContent as IssueDetailContent } from "../issue-detail-content/issue-detail-content"
import {
  emptyPendingFields,
  type IssueDetailProps,
} from "../issue-detail-types"
import { issueDiscardDialog as IssueDiscardDialog } from "../issue-discard-dialog/issue-discard-dialog"
import { emptyAssigneeOptions } from "../issue-utils/issue-utils"
import { useIssueAgentForm } from "../use-issue-agent-form/use-issue-agent-form"
import { useIssueCommentDirtyState } from "../use-issue-comment-dirty-state/use-issue-comment-dirty-state"
import { useIssueCommentForm } from "../use-issue-comment-form/use-issue-comment-form"
import { useIssueDescriptionForm } from "../use-issue-description-form/use-issue-description-form"
import { useIssueDetailNavigation } from "../use-issue-detail-navigation/use-issue-detail-navigation"
import { useIssueImmediateFields } from "../use-issue-immediate-fields/use-issue-immediate-fields"
import { useIssueTitleForm } from "../use-issue-title-form/use-issue-title-form"

export const IssueDetailPage = (props: IssueDetailProps) => {
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
      <article className="mx-auto w-full max-w-6xl">
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
      </article>
      <IssueDiscardDialog navigation={navigation} />
    </>
  )
}
