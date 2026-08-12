"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { SaveIcon } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import {
  clearConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/features/console"

import { issueTitleFormSchema } from "../../schema"
import {
  type StringFieldApi,
  type SubmitSelection,
} from "../form-types/form-types"
import { TitleEditorField } from "../issue-detail-editor-fields/issue-detail-editor-fields"
import type { IssueDetailProps } from "../issue-detail-types/issue-detail-types"
import { getActionErrorMessage } from "../issue-utils/issue-utils"
import type { IssueUiItem } from "../types/types"

export const useIssueTitleForm = ({
  issue,
  pending,
  onUpdate,
}: {
  issue: IssueUiItem
  pending?: boolean
  onUpdate: IssueDetailProps["onUpdate"]
}) => {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const form = useForm({
    defaultValues: { title: issue.title },
    validators: { onSubmit: issueTitleFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdate) return
      const title = value.title.trim()
      if (title === issue.title) {
        form.reset({ title: issue.title })
        setEditing(false)
        return
      }

      setError(undefined)
      setFieldErrors({})
      try {
        const updated = await onUpdate(issue, { title })
        form.reset({ title: updated?.title ?? title })
        setEditing(false)
      } catch (cause) {
        const nextFieldErrors = getConsoleApiFieldErrors(cause)
        setFieldErrors(nextFieldErrors)
        setError(
          hasConsoleApiFieldError(nextFieldErrors, ["title"])
            ? undefined
            : getActionErrorMessage(cause, "The title could not be updated.")
        )
      }
    },
  })
  useEffect(() => {
    if (!editing && !form.state.isDirty) {
      // form resetではissue変更後のfield state更新を意図的にbatchする。
      // oxlint-disable-next-line react-doctor/no-chain-state-updates
      form.reset({ title: issue.title })
    }
  }, [editing, form, issue.title])
  const beginEdit = useCallback(() => {
    form.reset({ title: issue.title })
    setError(undefined)
    setFieldErrors({})
    setEditing(true)
  }, [form, issue.title])
  const cancelEdit = useCallback(() => {
    form.reset({ title: issue.title })
    setError(undefined)
    setFieldErrors({})
    setEditing(false)
  }, [form, issue.title])
  const clearErrors = useCallback(() => {
    setError(undefined)
    setFieldErrors((current) => clearConsoleApiFieldError(current, "title"))
  }, [])
  const save = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const renderField = useCallback(
    (field: StringFieldApi) => (
      <TitleEditorField
        field={field}
        serverError={fieldErrors.title?.join(" ")}
        formError={error}
        onEdit={clearErrors}
        onCancel={cancelEdit}
      />
    ),
    [cancelEdit, clearErrors, error, fieldErrors.title]
  )
  const renderSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        type="submit"
        size="sm"
        disabled={
          pending || !onUpdate || !canSubmit || !isDirty || isSubmitting
        }
      >
        {pending || isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Save title
      </Button>
    ),
    [onUpdate, pending]
  )
  const applyDraft = useCallback(
    (title: string) => {
      form.setFieldValue("title", title)
      setEditing(true)
    },
    [form]
  )

  return {
    applyDraft,
    beginEdit,
    cancelEdit,
    editing,
    form,
    renderField,
    renderSubmit,
    save,
  }
}

export type IssueTitleFormState = ReturnType<typeof useIssueTitleForm>
