import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { FieldError } from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { HistoryIcon } from "lucide-react"

import type { IssueTimelineItem } from "../schema"
import { selectSubmitState } from "./form-types"
import { IssueActivityItem } from "./issue-activity"
import { IssueComment } from "./issue-comment"
import type { IssueDetailDialogProps } from "./issue-detail-types"
import { CommentBodyFormField } from "./text-form-fields"
import type { IssueAssigneeOption, IssueUiItem } from "./types"
import type { IssueCommentFormState } from "./use-issue-comment-form"

const IssueTimeline = ({
  issue,
  timeline,
  assignees,
  pending,
  getCommentDirtyHandler,
  onUpdateComment,
  onDeleteComment,
}: {
  issue: IssueUiItem
  timeline: IssueTimelineItem[]
  assignees: IssueAssigneeOption[]
  pending?: boolean
  getCommentDirtyHandler: (commentId: string) => (dirty: boolean) => void
  onUpdateComment: IssueDetailDialogProps["onUpdateComment"]
  onDeleteComment: IssueDetailDialogProps["onDeleteComment"]
}) =>
  timeline.length > 0 ? (
    <ol className="relative flex min-w-0 flex-col gap-1">
      {timeline.map((item) =>
        item.type === "activity" ? (
          <IssueActivityItem
            key={item.id}
            activity={item}
            assignees={assignees}
          />
        ) : (
          <IssueComment
            key={item.id}
            issue={issue}
            comment={item}
            pending={pending}
            onDirtyChange={getCommentDirtyHandler(item.id)}
            onUpdateComment={onUpdateComment}
            onDeleteComment={onDeleteComment}
          />
        )
      )}
    </ol>
  ) : (
    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      No activity yet. Add the first comment below.
    </p>
  )

const NewIssueCommentForm = ({
  comment,
}: {
  comment: IssueCommentFormState
}) => (
  <form
    className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4"
    onSubmit={comment.save}
  >
    <comment.form.Field name="body">
      {(field) => (
        <CommentBodyFormField
          field={field}
          id="issue-comment-body"
          label="Add comment"
          placeholder="Share an update or decision."
          className="min-h-28"
          onEdit={comment.clearError}
          serverError={comment.fieldError}
        />
      )}
    </comment.form.Field>
    {comment.error ? (
      <FieldError role="alert">{comment.error}</FieldError>
    ) : null}
    <comment.form.Subscribe selector={selectSubmitState}>
      {comment.renderSubmit}
    </comment.form.Subscribe>
  </form>
)

export const issueDetailDiscussion = ({
  issue,
  timeline,
  assignees,
  nextCursor,
  loadingOlder,
  pending,
  comment,
  getCommentDirtyHandler,
  onLoadOlder,
  onUpdateComment,
  onDeleteComment,
}: {
  issue: IssueUiItem
  timeline: IssueTimelineItem[]
  assignees: IssueAssigneeOption[]
  nextCursor: string | null
  loadingOlder?: boolean
  pending?: boolean
  comment: IssueCommentFormState
  getCommentDirtyHandler: (commentId: string) => (dirty: boolean) => void
  onLoadOlder: () => void
  onUpdateComment: IssueDetailDialogProps["onUpdateComment"]
  onDeleteComment: IssueDetailDialogProps["onDeleteComment"]
}) => (
  <section
    data-slot="issue-discussion"
    className="flex min-w-0 flex-col gap-5"
    aria-labelledby="discussion-heading"
  >
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h3 id="discussion-heading" className="font-medium">
          Discussion
        </h3>
        <p className="text-sm text-muted-foreground">
          Changes and comments, in chronological order.
        </p>
      </div>
      {nextCursor ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <HistoryIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Load older
        </Button>
      ) : null}
    </div>
    <IssueTimeline
      issue={issue}
      timeline={timeline}
      assignees={assignees}
      pending={pending}
      getCommentDirtyHandler={getCommentDirtyHandler}
      onUpdateComment={onUpdateComment}
      onDeleteComment={onDeleteComment}
    />
    <NewIssueCommentForm comment={comment} />
  </section>
)
