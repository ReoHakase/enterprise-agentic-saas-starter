"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  FieldError,
  FieldGroup,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { useCallback, useMemo, useState, type FormEvent } from "react"

import {
  commentFormSchema,
  parseDueDateInput,
  updateIssueFormSchema,
} from "@/features/issues/schema"
import {
  clearConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/lib/console-api"

import {
  selectSubmitState,
  type IssuePriorityFieldApi,
  type IssueStatusFieldApi,
  type LabelsFieldApi,
  type NullableStringFieldApi,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import { IssueComment } from "./issue-comment"
import {
  emptyAssigneeOptions,
  emptyIssueComments,
  formatIssueDate,
  getActionErrorMessage,
  getActionFieldError,
  getIssueStatus,
  issueNumber,
  StatusBadge,
} from "./issue-utils"
import {
  IssueAssigneeFormField,
  IssueDueDateFormField,
  IssueLabelsFormField,
  IssuePriorityFormField,
  IssueStatusFormField,
} from "./select-form-fields"
import {
  CommentBodyFormField,
  IssueDescriptionFormField,
  IssueTitleFormField,
} from "./text-form-fields"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueCommentUiItem,
  IssueUiItem,
  IssueUpdate,
} from "./types"

const issueUpdateFields = [
  "title",
  "description",
  "status",
  "priority",
  "assigneeId",
  "labels",
  "dueDate",
] as const

export const IssueDetailDialog = ({
  issue,
  assignees = emptyAssigneeOptions,
  comments = emptyIssueComments,
  commentsPending,
  commentsError,
  pending,
  onUpdate,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onOpenChange,
}: {
  issue: IssueUiItem
  assignees?: IssueAssigneeOption[]
  comments?: IssueCommentUiItem[]
  commentsPending?: boolean
  commentsError?: string
  pending?: boolean
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onCreateComment?: AsyncAction<[issue: IssueUiItem, body: string]>
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
  onOpenChange: (open: boolean) => void
}) => {
  const [saveError, setSaveError] = useState<string>()
  const [saveFieldErrors, setSaveFieldErrors] = useState<
    Record<string, string[]>
  >({})
  const [commentError, setCommentError] = useState<string>()
  const [commentFieldError, setCommentFieldError] = useState<string>()
  const assigneeItems = useMemo(
    () => [
      { label: "Unassigned", value: "unassigned" },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees]
  )
  const initialValues = useMemo(
    () => ({
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      assigneeId: issue.assigneeId,
      labels: issue.labels,
      dueDate: parseDueDateInput(issue.dueDate) || null,
    }),
    [issue]
  )
  const issueForm = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: updateIssueFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdate) return

      setSaveError(undefined)
      setSaveFieldErrors({})
      try {
        await onUpdate(issue, {
          ...value,
          description: value.description.trim(),
          dueDate: value.dueDate,
        })
      } catch (error) {
        const nextFieldErrors = getConsoleApiFieldErrors(error)
        setSaveFieldErrors(nextFieldErrors)
        setSaveError(
          hasConsoleApiFieldError(nextFieldErrors, issueUpdateFields)
            ? undefined
            : getActionErrorMessage(error, "The issue could not be updated.")
        )
      }
    },
  })
  const commentForm = useForm({
    defaultValues: { body: "" },
    validators: { onSubmit: commentFormSchema },
    onSubmit: async ({ value }) => {
      if (!onCreateComment) return

      setCommentError(undefined)
      setCommentFieldError(undefined)
      try {
        await onCreateComment(issue, value.body)
        commentForm.reset()
      } catch (error) {
        const fieldError = getActionFieldError(error, "body")
        setCommentFieldError(fieldError)
        setCommentError(
          fieldError
            ? undefined
            : getActionErrorMessage(error, "The comment could not be added.")
        )
      }
    },
  })
  const clearSaveFieldError = useCallback((field: string) => {
    setSaveFieldErrors((current) => clearConsoleApiFieldError(current, field))
    setSaveError(undefined)
  }, [])
  const clearCommentError = useCallback(() => {
    setCommentFieldError(undefined)
    setCommentError(undefined)
  }, [])

  const saveIssue = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void issueForm.handleSubmit()
    },
    [issueForm]
  )
  const createComment = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void commentForm.handleSubmit()
    },
    [commentForm]
  )
  const renderIssueTitleField = useCallback(
    (field: StringFieldApi) => (
      <IssueTitleFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.title}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueDescriptionField = useCallback(
    (field: StringFieldApi) => (
      <IssueDescriptionFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.description}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueStatusField = useCallback(
    (field: IssueStatusFieldApi) => (
      <IssueStatusFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.status}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssuePriorityField = useCallback(
    (field: IssuePriorityFieldApi) => (
      <IssuePriorityFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.priority}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueAssigneeField = useCallback(
    (field: NullableStringFieldApi) => (
      <IssueAssigneeFormField
        field={field}
        assignees={assignees}
        items={assigneeItems}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.assigneeId}
      />
    ),
    [assigneeItems, assignees, clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueLabelsField = useCallback(
    (field: LabelsFieldApi) => (
      <IssueLabelsFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.labels}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueDueDateField = useCallback(
    (field: NullableStringFieldApi) => (
      <IssueDueDateFormField
        field={field}
        onEdit={clearSaveFieldError}
        serverErrors={saveFieldErrors.dueDate}
      />
    ),
    [clearSaveFieldError, saveFieldErrors]
  )
  const renderIssueSubmit = useCallback(
    ([canSubmit, isSubmitting]: SubmitSelection) => (
      <Button
        type="submit"
        disabled={pending || !onUpdate || !canSubmit || isSubmitting}
      >
        {pending || isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Save changes
      </Button>
    ),
    [onUpdate, pending]
  )
  const renderNewCommentField = useCallback(
    (field: StringFieldApi) => (
      <CommentBodyFormField
        field={field}
        id="issue-comment-body"
        label="Add comment"
        placeholder="Share an update or decision."
        className="min-h-24"
        onEdit={clearCommentError}
        serverError={commentFieldError}
      />
    ),
    [clearCommentError, commentFieldError]
  )
  const renderCommentSubmit = useCallback(
    ([canSubmit, isSubmitting]: SubmitSelection) => (
      <Button
        className="self-end"
        type="submit"
        disabled={pending || !onCreateComment || !canSubmit || isSubmitting}
      >
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Comment
      </Button>
    ),
    [onCreateComment, pending]
  )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="h-svh max-h-svh w-full max-w-none overflow-y-auto rounded-none sm:h-auto sm:max-h-[calc(100svh-2rem)] sm:max-w-3xl sm:rounded-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={getIssueStatus(issue)} />
            <span className="text-sm text-muted-foreground">
              {issueNumber(issue)}
            </span>
          </div>
          <DialogTitle className="text-xl leading-tight">
            {issue.title}
          </DialogTitle>
          <DialogDescription>
            Created {formatIssueDate(issue.createdAt)} · Updated{" "}
            {formatIssueDate(issue.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={saveIssue}>
          <FieldGroup>
            <issueForm.Field name="title">
              {renderIssueTitleField}
            </issueForm.Field>
            <issueForm.Field name="description">
              {renderIssueDescriptionField}
            </issueForm.Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <issueForm.Field name="status">
                {renderIssueStatusField}
              </issueForm.Field>
              <issueForm.Field name="priority">
                {renderIssuePriorityField}
              </issueForm.Field>
              <issueForm.Field name="assigneeId">
                {renderIssueAssigneeField}
              </issueForm.Field>
              <issueForm.Field name="labels">
                {renderIssueLabelsField}
              </issueForm.Field>
              <issueForm.Field name="dueDate">
                {renderIssueDueDateField}
              </issueForm.Field>
            </FieldGroup>
          </FieldGroup>
          {saveError ? <FieldError role="alert">{saveError}</FieldError> : null}
          <DialogFooter className="sticky bottom-0 bg-background py-3">
            <issueForm.Subscribe selector={selectSubmitState}>
              {renderIssueSubmit}
            </issueForm.Subscribe>
          </DialogFooter>
        </form>

        <div className="flex flex-col gap-4 border-t pt-5">
          <div>
            <h3 className="font-medium">Discussion</h3>
            <p className="text-sm text-muted-foreground">
              Keep decisions and progress attached to the issue.
            </p>
          </div>
          {commentsPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading comments
            </div>
          ) : commentsError ? (
            <p role="alert" className="text-sm text-destructive">
              {commentsError}
            </p>
          ) : comments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <IssueComment
                  key={comment.id}
                  issue={issue}
                  comment={comment}
                  pending={pending}
                  onUpdateComment={onUpdateComment}
                  onDeleteComment={onDeleteComment}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No comments yet. Add the first update below.
            </p>
          )}
          <form className="flex flex-col gap-3" onSubmit={createComment}>
            <commentForm.Field name="body">
              {renderNewCommentField}
            </commentForm.Field>
            {commentError ? (
              <FieldError role="alert">{commentError}</FieldError>
            ) : null}
            <commentForm.Subscribe selector={selectSubmitState}>
              {renderCommentSubmit}
            </commentForm.Subscribe>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
