"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { SendIcon } from "lucide-react"
import { useCallback, useState, type FormEvent } from "react"

import { commentFormSchema } from "../../schema"
import type { SubmitSelection } from "../form-types/form-types"
import type { IssueDetailDialogProps } from "../issue-detail-types/issue-detail-types"
import {
  getActionErrorMessage,
  getActionFieldError,
} from "../issue-utils/issue-utils"
import type { IssueUiItem } from "../types/types"

export const useIssueCommentForm = ({
  issue,
  pending,
  onCreateComment,
}: {
  issue: IssueUiItem
  pending?: boolean
  onCreateComment: IssueDetailDialogProps["onCreateComment"]
}) => {
  const [error, setError] = useState<string>()
  const [fieldError, setFieldError] = useState<string>()
  const form = useForm({
    defaultValues: { body: "" },
    validators: { onSubmit: commentFormSchema },
    onSubmit: async ({ value }) => {
      if (!onCreateComment) return

      setError(undefined)
      setFieldError(undefined)
      try {
        await onCreateComment(issue, value.body)
        form.reset()
      } catch (cause) {
        const nextFieldError = getActionFieldError(cause, "body")
        setFieldError(nextFieldError)
        setError(
          nextFieldError
            ? undefined
            : getActionErrorMessage(cause, "The comment could not be added.")
        )
      }
    },
  })
  const save = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const clearError = useCallback(() => {
    setFieldError(undefined)
    setError(undefined)
  }, [])
  const renderSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        className="self-end"
        type="submit"
        disabled={
          pending || !onCreateComment || !canSubmit || !isDirty || isSubmitting
        }
      >
        {isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SendIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Comment
      </Button>
    ),
    [onCreateComment, pending]
  )

  return {
    clearError,
    error,
    fieldError,
    form,
    renderSubmit,
    save,
  }
}

export type IssueCommentFormState = ReturnType<typeof useIssueCommentForm>
