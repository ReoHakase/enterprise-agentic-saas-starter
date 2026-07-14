"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { FieldError } from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { UserAvatar } from "@/components/user-identity"
import { commentFormSchema } from "@/features/issues/schema"

import {
  selectSubmitState,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import {
  formatIssueDate,
  getActionErrorMessage,
  getActionFieldError,
  safelyRunAction,
} from "./issue-utils"
import { CommentBodyFormField } from "./text-form-fields"
import type { AsyncAction, IssueCommentUiItem, IssueUiItem } from "./types"

export const IssueComment = ({
  issue,
  comment,
  pending,
  onUpdateComment,
  onDeleteComment,
}: {
  issue: IssueUiItem
  comment: IssueCommentUiItem
  pending?: boolean
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
}) => {
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string>()
  const [editFieldError, setEditFieldError] = useState<string>()
  const editForm = useForm({
    defaultValues: { body: comment.body },
    validators: { onSubmit: commentFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdateComment) return

      setEditError(undefined)
      setEditFieldError(undefined)
      try {
        await onUpdateComment(issue, comment.id, value.body)
        setEditing(false)
      } catch (error) {
        setEditFieldError(getActionFieldError(error, "body"))
        setEditError(
          getActionErrorMessage(error, "The comment could not be updated.")
        )
      }
    },
  })

  useEffect(
    () => editForm.reset({ body: comment.body }),
    [comment.body, editForm]
  )
  const toggleEditing = useCallback(() => {
    editForm.reset({ body: comment.body })
    setEditError(undefined)
    setEditFieldError(undefined)
    setEditing((value) => !value)
  }, [comment.body, editForm])
  const deleteComment = useCallback(
    () => safelyRunAction(onDeleteComment?.(issue, comment.id)),
    [comment.id, issue, onDeleteComment]
  )
  const saveComment = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void editForm.handleSubmit()
    },
    [editForm]
  )
  const renderEditCommentField = useCallback(
    (field: StringFieldApi) => (
      <CommentBodyFormField
        field={field}
        id={`comment-${comment.id}`}
        label="Edit comment"
        labelClassName="sr-only"
        ariaLabel="Edit comment"
        serverError={editFieldError}
      />
    ),
    [comment.id, editFieldError]
  )
  const renderEditSubmit = useCallback(
    ([canSubmit, isSubmitting]: SubmitSelection) => (
      <Button
        type="submit"
        size="sm"
        className="self-end"
        disabled={pending || !canSubmit || isSubmitting}
      >
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Save comment
      </Button>
    ),
    [pending]
  )

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={comment.author} className="size-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {comment.author.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatIssueDate(comment.updatedAt)}
            </p>
          </div>
        </div>
        {onUpdateComment || onDeleteComment ? (
          <div className="flex items-center gap-1">
            {onUpdateComment ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={toggleEditing}
              >
                {editing ? "Cancel" : "Edit"}
              </Button>
            ) : null}
            {onDeleteComment ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" size="sm" disabled={pending} />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This comment will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={deleteComment}
                    >
                      Delete comment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing && onUpdateComment ? (
        <form className="flex flex-col gap-2" onSubmit={saveComment}>
          <editForm.Field name="body">{renderEditCommentField}</editForm.Field>
          {editError ? <FieldError role="alert">{editError}</FieldError> : null}
          <editForm.Subscribe selector={selectSubmitState}>
            {renderEditSubmit}
          </editForm.Subscribe>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      )}
    </div>
  )
}
