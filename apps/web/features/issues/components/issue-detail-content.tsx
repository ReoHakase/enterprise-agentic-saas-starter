import { Separator } from "@enterprise-agentic-saas/ui/components/separator"

import { FileAttachments } from "@/features/files/attachments.public"

import { issueDetailDescription as IssueDetailDescription } from "./issue-detail-description"
import { issueDetailDiscussion as IssueDetailDiscussion } from "./issue-detail-discussion"
import {
  issueDetailBackNavigation as IssueDetailBackNavigation,
  issueDetailHeader as IssueDetailHeader,
} from "./issue-detail-header"
import { issueDetailMetadata as IssueDetailMetadata } from "./issue-detail-metadata"
import type { IssueDetailDialogProps } from "./issue-detail-types"
import type { IssueAssigneeOption } from "./types"
import type { IssueCommentFormState } from "./use-issue-comment-form"
import type { IssueDescriptionFormState } from "./use-issue-description-form"
import type { IssueDetailNavigationState } from "./use-issue-detail-navigation"
import type { IssueImmediateFieldsState } from "./use-issue-immediate-fields"
import type { IssueTitleFormState } from "./use-issue-title-form"

const IssuePrimaryColumn = ({
  props,
  assignees,
  description,
  comment,
  navigation,
  getCommentDirtyHandler,
}: {
  props: IssueDetailDialogProps
  assignees: IssueAssigneeOption[]
  description: IssueDescriptionFormState
  comment: IssueCommentFormState
  navigation: IssueDetailNavigationState
  getCommentDirtyHandler: (commentId: string) => (dirty: boolean) => void
}) => (
  <div
    data-slot="issue-primary-column"
    className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1"
    role="group"
    aria-label="Issue primary content"
  >
    <IssueDetailDescription
      issue={props.issue}
      pending={props.pending}
      navigationBlocked={navigation.blocked}
      canUpdate={Boolean(props.onUpdate)}
      description={description}
    />
    <Separator />
    {props.organizationId ? (
      <>
        <FileAttachments
          organizationId={props.organizationId}
          ownerType="issue"
          ownerId={props.issue.id}
          onFilesChanged={props.onFilesChanged}
        />
        <Separator />
      </>
    ) : null}
    <IssueDetailDiscussion
      issue={props.issue}
      timeline={props.timeline}
      assignees={assignees}
      nextCursor={props.nextCursor}
      loadingOlder={props.loadingOlder}
      pending={props.pending}
      comment={comment}
      getCommentDirtyHandler={getCommentDirtyHandler}
      onLoadOlder={props.onLoadOlder}
      onUpdateComment={props.onUpdateComment}
      onDeleteComment={props.onDeleteComment}
    />
  </div>
)

export const issueDetailContent = ({
  props,
  assignees,
  labelSuggestions,
  title,
  description,
  comment,
  navigation,
  fields,
  getCommentDirtyHandler,
}: {
  props: IssueDetailDialogProps
  assignees: IssueAssigneeOption[]
  labelSuggestions: string[]
  title: IssueTitleFormState
  description: IssueDescriptionFormState
  comment: IssueCommentFormState
  navigation: IssueDetailNavigationState
  fields: IssueImmediateFieldsState
  getCommentDirtyHandler: (commentId: string) => (dirty: boolean) => void
}) => (
  <section
    data-slot="issue-detail"
    data-route-boundary="true"
    data-boundary-state="ready"
    data-testid="issue-detail"
    className={
      props.mode === "modal"
        ? "flex min-h-full flex-col gap-6 [--issue-timeline-surface:var(--popover)]"
        : "flex min-h-full flex-col gap-6 [--issue-timeline-surface:var(--background)]"
    }
  >
    {props.mode === "page" ? (
      <IssueDetailBackNavigation
        blocked={navigation.blocked}
        onBack={navigation.backToIssues}
      />
    ) : null}
    <IssueDetailHeader
      issue={props.issue}
      mode={props.mode}
      pending={props.pending}
      canUpdate={Boolean(props.onUpdate)}
      title={title}
      navigation={navigation}
    />
    <div
      data-slot="issue-detail-layout"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-x-8"
    >
      <IssueDetailMetadata
        issue={props.issue}
        assignees={assignees}
        labelSuggestions={labelSuggestions}
        canUpdate={Boolean(props.onUpdate)}
        fields={fields}
      />
      <IssuePrimaryColumn
        props={props}
        assignees={assignees}
        description={description}
        comment={comment}
        navigation={navigation}
        getCommentDirtyHandler={getCommentDirtyHandler}
      />
    </div>
  </section>
)
