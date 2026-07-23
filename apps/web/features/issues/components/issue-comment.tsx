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
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import { FieldError } from "@enterprise-agentic-saas/ui/components/field"
import { Separator } from "@enterprise-agentic-saas/ui/components/separator"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { PencilIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"

import { LocalDate } from "@/components/local-date"
import { UserProfileImage } from "@/components/user-identity"
import { commentFormSchema } from "@/features/issues/schema"

import {
  selectSubmitState,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import {
  getActionErrorMessage,
  getActionFieldError,
  safelyRunAction,
} from "./issue-utils"
import { CommentBodyFormField } from "./text-form-fields"
import type { AsyncAction, IssueCommentUiItem, IssueUiItem } from "./types"

const deleteCommentTrigger = <Button variant="ghost" size="xs" />
const selectIsDirty = (state: { isDirty: boolean }) => state.isDirty

const CommentDirtyReporter = ({
  dirty,
  onDirtyChange,
}: {
  dirty: boolean
  onDirtyChange?: (dirty: boolean) => void
}) => {
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange?.(false)
    },
    [onDirtyChange]
  )
  return null
}

export const IssueComment = ({
  issue,
  comment,
  pending,
  onUpdateComment,
  onDeleteComment,
  onDirtyChange,
}: {
  issue: IssueUiItem
  comment: IssueCommentUiItem
  pending?: boolean
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
  onDirtyChange?: (dirty: boolean) => void
}) => {
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string>()
  const [editFieldError, setEditFieldError] = useState<string>()
  const edited = useMemo(
    () =>
      new Date(comment.updatedAt).getTime() >
      new Date(comment.createdAt).getTime(),
    [comment.createdAt, comment.updatedAt]
  )
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
        const fieldError = getActionFieldError(error, "body")
        setEditFieldError(fieldError)
        setEditError(
          fieldError
            ? undefined
            : getActionErrorMessage(error, "The comment could not be updated.")
        )
      }
    },
  })
  const clearEditError = useCallback(() => {
    setEditError(undefined)
    setEditFieldError(undefined)
  }, [])

  useEffect(() => {
    if (editing && editForm.state.isDirty) return
    editForm.reset({ body: comment.body })
  }, [comment.body, editForm, editing])
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
        onEdit={clearEditError}
        serverError={editFieldError}
      />
    ),
    [clearEditError, comment.id, editFieldError]
  )
  const renderEditSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        type="submit"
        size="sm"
        className="self-end"
        disabled={pending || !canSubmit || !isDirty || isSubmitting}
      >
        {isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Save comment
      </Button>
    ),
    [pending]
  )

  return (
    <li
      data-slot="issue-timeline-item"
      className="relative isolate grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 pb-3 before:absolute before:top-4 before:-bottom-3 before:left-[1.09375rem] before:z-0 before:w-px before:bg-border last:pb-0 last:before:hidden"
    >
      <span
        data-slot="issue-timeline-marker"
        data-testid="issue-comment-actor-marker"
        className="relative z-20 flex size-9 items-center justify-center rounded-full bg-(--issue-timeline-surface,var(--color-background)) ring-4 ring-(--issue-timeline-surface,var(--color-background))"
        aria-hidden="true"
      >
        <UserProfileImage user={comment.author} className="size-8" />
      </span>
      <Card
        size="sm"
        data-testid="issue-comment-card"
        className="relative z-10 min-w-0 gap-0 rounded-xl border py-0 shadow-none ring-0 dark:ring-0"
      >
        <CardHeader className="flex flex-row flex-wrap items-start gap-2 rounded-t-xl bg-muted/40 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-[1_1_14rem] flex-wrap items-center gap-x-3 gap-y-1">
            <p className="truncate text-sm font-medium">
              {comment.author.name}
            </p>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-xs text-muted-foreground">
              <LocalDate includeTime value={comment.createdAt} />
              {edited ? (
                <>
                  <Badge variant="secondary">
                    <PencilIcon aria-hidden="true" />
                    Edited
                  </Badge>
                  <span>
                    edited at{" "}
                    <LocalDate includeTime value={comment.updatedAt} />
                  </span>
                </>
              ) : null}
            </div>
          </div>
          {onUpdateComment || onDeleteComment ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {onUpdateComment ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={toggleEditing}
                >
                  {editing ? (
                    <XIcon data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <PencilIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {editing ? "Cancel" : "Edit"}
                </Button>
              ) : null}
              {onDeleteComment ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={deleteCommentTrigger}
                    disabled={pending}
                  >
                    <Trash2Icon data-icon="inline-start" aria-hidden="true" />
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
                      <AlertDialogCancel>
                        <XIcon data-icon="inline-start" aria-hidden="true" />
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={deleteComment}
                      >
                        <Trash2Icon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                        Delete comment
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <Separator />
        <CardContent className="p-3 sm:p-4">
          {editing && onUpdateComment ? (
            <form className="flex flex-col gap-2" onSubmit={saveComment}>
              <editForm.Field name="body">
                {renderEditCommentField}
              </editForm.Field>
              {editError ? (
                <FieldError role="alert">{editError}</FieldError>
              ) : null}
              <editForm.Subscribe selector={selectSubmitState}>
                {renderEditSubmit}
              </editForm.Subscribe>
            </form>
          ) : (
            <p className="text-sm leading-6 whitespace-pre-wrap">
              {comment.body}
            </p>
          )}
        </CardContent>
      </Card>
      <editForm.Subscribe selector={selectIsDirty}>
        {(isDirty) => (
          <CommentDirtyReporter
            dirty={editing && isDirty}
            onDirtyChange={onDirtyChange}
          />
        )}
      </editForm.Subscribe>
    </li>
  )
}
